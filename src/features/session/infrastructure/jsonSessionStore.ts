import type { SessionSnapshot } from '@shared/contracts/clipea2Api'
import { AtomicJsonFile } from '@shared/infrastructure/atomicJsonFile'
import { fileExists } from '@shared/infrastructure/fileExists'

/** Keeps the montage and the drawings between app restarts. */
export class JsonSessionStore {
  private readonly file: AtomicJsonFile

  constructor(filePath: string) {
    this.file = new AtomicJsonFile(filePath)
  }

  async load(): Promise<SessionSnapshot | null> {
    const snapshot = (await this.file.read()) as Partial<SessionSnapshot> | null
    if (!snapshot || typeof snapshot !== 'object') return null
    const montage = Array.isArray(snapshot.montage) ? snapshot.montage : []
    const annotations = Array.isArray(snapshot.annotations) ? snapshot.annotations : []
    const last = typeof snapshot.lastSourcePath === 'string' ? snapshot.lastSourcePath : null
    // Recordings deleted since last time would break the montage.
    const paths = [...new Set([...montage.map((segment) => segment.sourcePath), ...annotations.map((annotation) => annotation.sourcePath), ...(last ? [last] : [])])]
    const present = new Set((await Promise.all(paths.map(async (path) => ((await fileExists(path)) ? path : null)))).filter(Boolean))
    return {
      montage: montage.filter((segment) => present.has(segment.sourcePath)),
      annotations: annotations.filter((annotation) => present.has(annotation.sourcePath)),
      lastSourcePath: last && present.has(last) ? last : null
    }
  }

  save(snapshot: SessionSnapshot): Promise<void> {
    return this.file.write(snapshot)
  }

  /** Resolves once every queued save reached the disk (used before quitting). */
  flush(): Promise<void> {
    return this.file.flush()
  }
}
