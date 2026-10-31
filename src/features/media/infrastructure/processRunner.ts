import { getT } from '@shared/i18n'
import { spawn } from 'node:child_process'
import { constants, setPriority } from 'node:os'

export interface ProcessResult {
  stdout: string
  stderr: string
  code: number | null
}

interface RunOptions {
  signal?: AbortSignal
  /** Streams stdout line by line instead of buffering it (ffmpeg -progress). */
  onStdoutLine?: (line: string) => void
  timeoutMs?: number
  /** `background`: below-normal CPU priority, so previews never steal time from playback or an export. */
  priority?: 'normal' | 'background'
}

const MAX_STDERR = 20_000

const abortError = (): Error => Object.assign(new Error(getT().media.cancelled), { name: 'AbortError' })

/**
 * Runs a process and collects its output. On abort it kills the process and only settles once the
 * process is really gone: on Windows its files stay locked until then, so cleanup must wait.
 */
export function runProcess(command: string, args: readonly string[], options: RunOptions = {}): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) return reject(abortError())
    const child = spawn(command, args, { windowsHide: true })
    if (options.priority === 'background' && child.pid !== undefined) {
      try {
        setPriority(child.pid, constants.priority.PRIORITY_BELOW_NORMAL)
      } catch {
        // The process may already be gone; priority is only a hint.
      }
    }
    let stdout = ''
    let stderr = ''
    let partialLine = ''
    let aborted = false

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      if (!options.onStdoutLine) {
        stdout += chunk
        return
      }
      const lines = (partialLine + chunk).split(/\r?\n/)
      partialLine = lines.pop() ?? ''
      lines.forEach(options.onStdoutLine)
    })
    child.stderr.on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-MAX_STDERR)
    })

    const onAbort = (): void => {
      aborted = true
      child.kill()
    }
    options.signal?.addEventListener('abort', onAbort, { once: true })
    const timer = options.timeoutMs ? setTimeout(() => child.kill(), options.timeoutMs) : null
    const cleanup = (): void => {
      if (timer) clearTimeout(timer)
      options.signal?.removeEventListener('abort', onAbort)
    }

    child.on('error', (error) => {
      cleanup()
      reject(aborted ? abortError() : error)
    })
    child.on('close', (code) => {
      cleanup()
      if (aborted) return reject(abortError())
      if (partialLine && options.onStdoutLine) options.onStdoutLine(partialLine)
      resolve({ stdout, stderr, code })
    })
  })
}
