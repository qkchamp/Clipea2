import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ExportRecord } from '../domain/exportRecord'
import { JsonHistoryStore } from './jsonHistoryStore'

const dirs: string[] = []
const tempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'clipea2-history-'))
  dirs.push(dir)
  return dir
}
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })))

const record = (id: string, path: string, sourcePath: string): ExportRecord => ({
  id,
  path,
  createdAt: Date.now(),
  sizeBytes: 1000,
  sizeLimitBytes: 20_000_000,
  fits: true,
  attempts: 1,
  durationSec: 10,
  video: { width: 1280, height: 720, fps: 30, codec: 'hevc', kbps: 3000 },
  estimatedMaxBytes: 5000,
  segments: [{ sourcePath, sourceLabel: 'x', start: 0, end: 10 }],
  annotations: []
})

describe('JsonHistoryStore', () => {
  it('persists records and reports what still exists on disk', async () => {
    const dir = tempDir()
    const exported = join(dir, 'clip.mp4')
    const source = join(dir, 'source.mp4')
    writeFileSync(exported, 'x')
    writeFileSync(source, 'x')
    const file = join(dir, 'history.json')

    const store = new JsonHistoryStore(file)
    await store.add(record('a', exported, source))
    await store.add(record('b', join(dir, 'deleted.mp4'), join(dir, 'gone.mp4')))

    const reopened = await new JsonHistoryStore(file).list()
    expect(reopened.map((entry) => [entry.id, entry.fileExists, entry.missingSources])).toEqual([
      ['b', false, 1],
      ['a', true, 0]
    ])
    expect((await store.remove('b')).map((entry) => entry.id)).toEqual(['a'])
  })

  it('empties the list without touching the exported files', async () => {
    const dir = tempDir()
    const exported = join(dir, 'clip.mp4')
    writeFileSync(exported, 'x')
    const file = join(dir, 'history.json')
    const store = new JsonHistoryStore(file)
    await store.add(record('a', exported, exported))

    expect(await store.clear()).toEqual([])
    expect(await new JsonHistoryStore(file).list()).toEqual([])
    expect(existsSync(exported)).toBe(true)
  })

  it('starts empty with a missing or broken file', async () => {
    const dir = tempDir()
    expect(await new JsonHistoryStore(join(dir, 'none.json')).list()).toEqual([])
    writeFileSync(join(dir, 'broken.json'), '{nope')
    expect(await new JsonHistoryStore(join(dir, 'broken.json')).list()).toEqual([])
  })
})
