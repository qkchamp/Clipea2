import { readdir, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { LibraryRepository } from '../application/scanLibrary'
import { isInstantReplay, isVideoFile, parseRecordedAt, type LibraryClip } from '../domain/libraryClip'

/** Reads the ShadowPlay layout: <root>/<game>/<clips>, plus loose files in <root>. */
export class FsLibraryRepository implements LibraryRepository {
  async listVideoFiles(root: string): Promise<LibraryClip[]> {
    const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
    const folders = entries.filter((entry) => entry.isDirectory()).map((entry) => join(root, entry.name))
    const batches = await Promise.all([root, ...folders].map((folder) => this.readFolder(folder)))
    return batches.flat()
  }

  private async readFolder(folderPath: string): Promise<LibraryClip[]> {
    const entries = await readdir(folderPath, { withFileTypes: true }).catch(() => [])
    const files = entries.filter((entry) => entry.isFile() && isVideoFile(entry.name))
    const clips = await Promise.all(
      files.map(async (entry): Promise<LibraryClip | null> => {
        const path = join(folderPath, entry.name)
        const info = await stat(path).catch(() => null)
        if (!info) return null
        return {
          path,
          fileName: entry.name,
          game: basename(folderPath),
          folderPath,
          sizeBytes: info.size,
          modifiedMs: info.mtimeMs,
          recordedAtMs: parseRecordedAt(entry.name),
          isInstantReplay: isInstantReplay(entry.name)
        }
      })
    )
    return clips.filter((clip): clip is LibraryClip => clip !== null)
  }
}
