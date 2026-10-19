import { access } from 'node:fs/promises'

/**
 * Async existence check. The sync one blocks the main process, and with it every IPC call and the
 * video stream: on a sleeping HDD each check can take tens of milliseconds.
 */
export function fileExists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false
  )
}
