import { readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'

export interface CacheLimits {
  maxBytes: number
  maxAgeMs: number
}

/**
 * Drops what is older than `maxAgeMs`, then the oldest entries until the folder fits in `maxBytes`.
 * `keep` (a path inside it) is never dropped: what was just made stays even when it alone passes the limit.
 */
export async function pruneCacheDir(dir: string, limits: CacheLimits, now = Date.now(), keep: string | null = null): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const items: Array<{ path: string; bytes: number; mtimeMs: number }> = []
  for (const entry of entries) {
    const path = join(dir, entry.name)
    const info = await stat(path).catch(() => null)
    if (!info) continue
    let bytes = info.size
    if (entry.isDirectory()) {
      const files = await readdir(path).catch(() => [] as string[])
      const sizes = await Promise.all(files.map((file) => stat(join(path, file)).then((s) => s.size, () => 0)))
      bytes = sizes.reduce((total, size) => total + size, 0)
    }
    items.push({ path, bytes, mtimeMs: info.mtimeMs })
  }
  items.sort((a, b) => a.mtimeMs - b.mtimeMs)
  let total = items.reduce((sum, item) => sum + item.bytes, 0)
  for (const item of items) {
    if (now - item.mtimeMs <= limits.maxAgeMs && total <= limits.maxBytes) break
    if (item.path === keep) continue
    await rm(item.path, { recursive: true, force: true }).catch(() => undefined)
    total -= item.bytes
  }
}
