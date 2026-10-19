import { clipboard } from 'electron'
import { runProcess } from '@features/media/infrastructure/processRunner'

/**
 * Copies the file itself (CF_HDROP, like Ctrl+C in Explorer) so Ctrl+V in Discord attaches it.
 * Electron's clipboard API cannot write file lists on Windows; Windows PowerShell 5.1 can.
 */
export async function copyFileToClipboard(filePath: string): Promise<void> {
  if (process.platform !== 'win32') {
    clipboard.writeText(filePath)
    return
  }
  const literal = filePath.replace(/'/g, "''")
  const { code, stderr } = await runProcess(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', `Set-Clipboard -LiteralPath '${literal}'`],
    { timeoutMs: 15_000 }
  )
  if (code !== 0) throw new Error(stderr.trim() || 'No se pudo copiar el archivo al portapapeles')
}
