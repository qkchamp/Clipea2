import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/**
 * A JSON file written atomically (temp file + rename) through a queue: two quick saves can never
 * interleave and a crash mid-write leaves the previous version intact.
 */
export class AtomicJsonFile {
  private queue: Promise<void> = Promise.resolve()

  constructor(
    private readonly filePath: string,
    private readonly indent = 0
  ) {}

  /** Parsed content, or null when the file is missing or broken. */
  async read(): Promise<unknown> {
    const raw = await readFile(this.filePath, 'utf8').catch(() => null)
    if (!raw) return null
    try {
      return JSON.parse(raw) as unknown
    } catch {
      return null
    }
  }

  write(value: unknown): Promise<void> {
    const text = JSON.stringify(value, null, this.indent || undefined)
    const next = this.queue
      .catch(() => undefined)
      .then(async () => {
        await mkdir(dirname(this.filePath), { recursive: true })
        const temporary = `${this.filePath}.tmp`
        await writeFile(temporary, text, 'utf8')
        await rename(temporary, this.filePath)
      })
    this.queue = next
    return next
  }

  flush(): Promise<void> {
    return this.queue.catch(() => undefined)
  }
}
