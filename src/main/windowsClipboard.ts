import { spawn } from 'node:child_process'
import { constants, setPriority } from 'node:os'
import { clipboard } from 'electron'

/**
 * Copies the file itself (CF_HDROP, like Ctrl+C in Explorer) so Ctrl+V in Discord attaches it.
 * Electron's clipboard API cannot write file lists on Windows; Windows PowerShell 5.1 can.
 *
 * PowerShell takes over a second to start, so one is started ahead of time and waits for the path
 * on its input: it copies and exits, the same as a fresh one would, and the next one starts then.
 */
const SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  'Add-Type -AssemblyName System.Windows.Forms',
  // Only reads: loads what Set-Clipboard needs, so the copy itself takes ~35 ms instead of ~200.
  'try { $null = Get-Clipboard -Format FileDropList } catch {}',
  '$line = [Console]::In.ReadLine()',
  'if (-not $line) { exit 0 }',
  'Set-Clipboard -LiteralPath ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($line)))'
].join('; ')

const TIMEOUT_MS = 15_000
/** A waiting PowerShell holds some memory: it goes away when nobody copied for a while. */
const IDLE_MS = 5 * 60_000

interface Helper {
  /** Sends the path; settles once the copy is done and the process has exited. */
  copy(filePath: string): Promise<void>
  /** Lets it exit without copying anything. */
  dismiss(): void
  alive(): boolean
}

function startHelper(): Helper {
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-NoLogo', '-Command', SCRIPT], { windowsHide: true })
  if (child.pid !== undefined) {
    try {
      // While it only waits, it never competes with the game or an export.
      setPriority(child.pid, constants.priority.PRIORITY_BELOW_NORMAL)
    } catch {
      // Already gone: copy() will say so.
    }
  }
  let stderr = ''
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk: string) => {
    stderr = (stderr + chunk).slice(-4000)
  })
  child.stdin.on('error', () => undefined)
  const exited = new Promise<number | null>((resolve) => {
    child.on('error', () => resolve(-1))
    child.on('close', (code) => resolve(code))
  })

  return {
    alive: () => child.exitCode === null && child.signalCode === null && !child.killed,
    dismiss: () => child.stdin.end(),
    async copy(filePath) {
      const timer = setTimeout(() => child.kill(), TIMEOUT_MS)
      child.stdin.end(`${Buffer.from(filePath, 'utf8').toString('base64')}\n`)
      const code = await exited
      clearTimeout(timer)
      if (code !== 0) throw new Error(stderr.trim() || 'No se pudo copiar el archivo al portapapeles')
    }
  }
}

let spare: Helper | null = null
let idleTimer: NodeJS.Timeout | undefined

function keepSpareFor(ms: number): void {
  clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    spare?.dismiss()
    spare = null
  }, ms)
}

/** Gets a PowerShell ready for the next copy: the exports are on screen, a copy may come. */
export function prepareFileCopy(): void {
  if (process.platform !== 'win32') return
  if (!spare?.alive()) spare = startHelper()
  keepSpareFor(IDLE_MS)
}

export async function copyFileToClipboard(filePath: string): Promise<void> {
  if (process.platform !== 'win32') {
    clipboard.writeText(filePath)
    return
  }
  const helper = spare?.alive() ? spare : startHelper()
  spare = null
  try {
    await helper.copy(filePath)
  } finally {
    // Someone who copies once often copies again.
    prepareFileCopy()
  }
}
