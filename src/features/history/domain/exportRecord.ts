import type { Annotation } from '@features/annotations/domain/annotation'
import { getT } from '@shared/i18n'
import type { GpuVendor } from '@features/export/domain/encoderSupport'
import type { VideoCodec } from '@features/export/domain/encodingPlan'

export interface ExportRecordSegment {
  sourcePath: string
  sourceLabel: string
  start: number
  end: number
}

/** What the editor knows about an export before it runs; enough to export it again later. */
export interface ExportRecordDraft {
  segments: ExportRecordSegment[]
  annotations: Annotation[]
  estimatedMaxBytes: number
}

/** A finished export, kept in the history. */
export interface ExportRecord extends ExportRecordDraft {
  id: string
  path: string
  createdAt: number
  sizeBytes: number
  sizeLimitBytes: number | null
  fits: boolean
  attempts: number
  durationSec: number
  /** Seconds the export took, retries included (missing in exports from older versions). */
  renderSec?: number
  /** `gpu`: encoder that produced the file, null for the CPU (missing in exports from older versions). */
  video: { width: number; height: number; fps: number; codec: VideoCodec; kbps: number; gpu?: GpuVendor | null }
}

/** A record plus what is true about it on disk right now. */
export interface HistoryEntry extends ExportRecord {
  fileExists: boolean
  /** Recordings used by the export that no longer exist (it cannot be exported again). */
  missingSources: number
}

export const MAX_HISTORY = 200

/** Newest first; re-adding an id replaces it. */
export function addRecord(records: readonly ExportRecord[], record: ExportRecord): ExportRecord[] {
  return [record, ...records.filter((existing) => existing.id !== record.id)].slice(0, MAX_HISTORY)
}

export function removeRecord(records: readonly ExportRecord[], id: string): ExportRecord[] {
  return records.filter((record) => record.id !== id)
}

/** "C:\…\golazo final (2).mp4" → "golazo final (2)" */
export function recordTitle(record: Pick<ExportRecord, 'path'>): string {
  const name = record.path.split(/[\\/]/).pop() ?? record.path
  return name.replace(/\.mp4$/i, '')
}

/** File name to reuse when exporting again: the copy suffix goes away, the save dialog proposes a free name. */
export function reexportName(record: Pick<ExportRecord, 'path'>): string {
  return recordTitle(record).replace(/ \(\d+\)$/, '')
}

const pad = (value: number): string => String(value).padStart(2, '0')
/** "Hoy 07:52", "Ayer 23:10", "16 sep · 02:47" (in the language in use). */
export function formatExportDate(ms: number, now: Date = new Date()): string {
  const date = new Date(ms)
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const { history, dates } = getT()
  if (ms >= startOfToday) return history.today(time)
  if (ms >= startOfToday - 86_400_000) return history.yesterday(time)
  return dates.recordedAt(date.getDate(), dates.monthsShort[date.getMonth()], time)
}

export function totalSize(entries: readonly HistoryEntry[]): number {
  return entries.filter((entry) => entry.fileExists).reduce((total, entry) => total + entry.sizeBytes, 0)
}

/**
 * The list is read again from disk on every refresh (each time «Exportados» opens): entries that
 * did not change keep their object, so the screen only redraws the cards that did.
 */
export function keepUnchanged(previous: readonly HistoryEntry[], next: HistoryEntry[]): HistoryEntry[] {
  const known = new Map(previous.map((entry) => [entry.id, entry]))
  return next.map((entry) => {
    const old = known.get(entry.id)
    return old && JSON.stringify(old) === JSON.stringify(entry) ? old : entry
  })
}
