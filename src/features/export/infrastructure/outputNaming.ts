import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { PARTIAL_EXPORT_SUFFIX } from '@features/library/domain/libraryClip'

/** Windows-safe file name without extension. */
export function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(/\.mp4$/i, '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
  return cleaned || 'clip'
}

/** Never overwrites: "clip.mp4", then "clip (2).mp4", "clip (3).mp4"… */
export function uniqueOutputPath(dir: string, fileName: string, exists: (path: string) => boolean = existsSync): string {
  const base = sanitizeFileName(fileName)
  for (let copy = 1; ; copy++) {
    const candidate = join(dir, copy === 1 ? `${base}.mp4` : `${base} (${copy}).mp4`)
    if (!exists(candidate)) return candidate
  }
}

/**
 * Where ffmpeg writes while encoding, next to the final file (same disk, so the rename is instant).
 * The ".partial" name keeps a half-written clip from looking ready to drag into Discord.
 */
export function partialOutputPath(dir: string, fileName: string, jobId: string): string {
  return join(dir, `${sanitizeFileName(fileName)}.${jobId.slice(0, 8)}${PARTIAL_EXPORT_SUFFIX}`)
}
