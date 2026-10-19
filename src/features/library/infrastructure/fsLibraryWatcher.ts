import { watch, type FSWatcher } from 'node:fs'
import { isVideoFile } from '../domain/libraryClip'

/** Quiet time before reporting: ShadowPlay keeps writing a recording for a while after it appears. */
const SETTLE_MS = 1500

/** Tells when recordings appear, disappear or get renamed under the library folders. */
export class FsLibraryWatcher {
  private readonly watchers = new Map<string, FSWatcher>()
  private readonly timers = new Map<string, NodeJS.Timeout>()

  constructor(private readonly onChange: (root: string) => void) {}

  /** Watches exactly these folders: new ones start, the ones no longer listed stop. */
  watch(roots: readonly string[]): void {
    for (const root of [...this.watchers.keys()]) if (!roots.includes(root)) this.unwatch(root)
    for (const root of roots) if (!this.watchers.has(root)) this.start(root)
  }

  stop(): void {
    for (const root of [...this.watchers.keys()]) this.unwatch(root)
  }

  private start(root: string): void {
    try {
      const watcher = watch(root, { recursive: true }, (_event, fileName) => {
        // Folder events have no extension; anything else that is not a video is noise (logs, temp files).
        const name = fileName ? String(fileName) : ''
        if (name !== '' && /\.[^\/]+$/.test(name) && !isVideoFile(name)) return
        this.schedule(root)
      })
      watcher.on('error', () => this.unwatch(root))
      this.watchers.set(root, watcher)
    } catch {
      // Missing folder: nothing to watch until the next call.
    }
  }

  private unwatch(root: string): void {
    this.watchers.get(root)?.close()
    this.watchers.delete(root)
    const timer = this.timers.get(root)
    if (timer) clearTimeout(timer)
    this.timers.delete(root)
  }

  private schedule(root: string): void {
    const pending = this.timers.get(root)
    if (pending) clearTimeout(pending)
    this.timers.set(
      root,
      setTimeout(() => {
        this.timers.delete(root)
        this.onChange(root)
      }, SETTLE_MS)
    )
  }
}
