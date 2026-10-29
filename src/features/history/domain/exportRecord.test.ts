import { describe, expect, it } from 'vitest'
import {
  addRecord,
  formatExportDate,
  keepUnchanged,
  MAX_HISTORY,
  recordTitle,
  reexportName,
  removeRecord,
  totalSize,
  type ExportRecord,
  type HistoryEntry
} from './exportRecord'

const record = (id: string, path = `C:\\out\\${id}.mp4`): ExportRecord => ({
  id,
  path,
  createdAt: 0,
  sizeBytes: 10_000_000,
  sizeLimitBytes: 20_000_000,
  fits: true,
  attempts: 1,
  durationSec: 90,
  video: { width: 1280, height: 720, fps: 30, codec: 'hevc', kbps: 1485 },
  estimatedMaxBytes: 19_000_000,
  segments: [{ sourcePath: 'a.mp4', sourceLabel: 'Rematch', start: 0, end: 90 }],
  annotations: []
})

describe('history list', () => {
  it('puts the newest export first', () => {
    expect(addRecord([record('a')], record('b')).map((r) => r.id)).toEqual(['b', 'a'])
  })

  it('replaces a record with the same id', () => {
    expect(addRecord([record('a'), record('b')], record('b'))).toHaveLength(2)
  })

  it('keeps a bounded history', () => {
    const many = Array.from({ length: MAX_HISTORY }, (_, index) => record(String(index)))
    expect(addRecord(many, record('new'))).toHaveLength(MAX_HISTORY)
  })

  it('removes records', () => {
    expect(removeRecord([record('a'), record('b')], 'a').map((r) => r.id)).toEqual(['b'])
  })

  it('adds only the sizes of files that still exist', () => {
    const entries: HistoryEntry[] = [
      { ...record('a'), fileExists: true, missingSources: 0 },
      { ...record('b'), fileExists: false, missingSources: 0 }
    ]
    expect(totalSize(entries)).toBe(10_000_000)
  })
})

describe('names', () => {
  it('uses the file name as title', () => {
    expect(recordTitle(record('x', 'C:\\Videos\\golazo final.mp4'))).toBe('golazo final')
  })

  it('drops the copy number when exporting again', () => {
    expect(reexportName(record('x', 'C:\\Videos\\golazo final (2).mp4'))).toBe('golazo final')
  })
})

describe('formatExportDate', () => {
  const now = new Date(2026, 9, 3, 12, 0)

  it('says today and yesterday', () => {
    expect(formatExportDate(new Date(2026, 9, 3, 7, 52).getTime(), now)).toBe('Hoy 07:52')
    expect(formatExportDate(new Date(2026, 9, 2, 23, 10).getTime(), now)).toBe('Ayer 23:10')
  })

  it('uses the date for older exports', () => {
    expect(formatExportDate(new Date(2026, 8, 16, 2, 47).getTime(), now)).toBe('16 sep · 02:47')
  })
})

describe('refreshing the list', () => {
  const entry = (id: string, fileExists = true): HistoryEntry => ({ ...record(id), fileExists, missingSources: 0 })

  it('keeps the same object for entries that did not change', () => {
    const previous = [entry('a'), entry('b')]
    const next = keepUnchanged(previous, [entry('a'), entry('b')])
    expect(next[0]).toBe(previous[0])
    expect(next[1]).toBe(previous[1])
  })

  it('takes the new object when something changed, and new entries as they come', () => {
    const previous = [entry('a'), entry('b')]
    const fresh = [entry('c'), entry('a', false), entry('b')]
    const next = keepUnchanged(previous, fresh)
    expect(next).toEqual(fresh)
    expect(next[0]).toBe(fresh[0])
    expect(next[1]).toBe(fresh[1])
    expect(next[2]).toBe(previous[1])
  })
})
