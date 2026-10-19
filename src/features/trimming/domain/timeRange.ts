import { clamp } from '@shared/domain/time'

export interface TimeRange {
  readonly start: number
  readonly end: number
}

export const MIN_RANGE_SECONDS = 0.1

export function rangeDuration(range: TimeRange): number {
  return Math.max(0, range.end - range.start)
}

export function fullRange(duration: number): TimeRange {
  return { start: 0, end: Math.max(0, duration) }
}

export function isValidRange(range: TimeRange): boolean {
  return rangeDuration(range) >= MIN_RANGE_SECONDS - 1e-9
}

/** Sets the in point (I). If it passes the out point, the out point jumps to the end. */
export function withStart(range: TimeRange, time: number, duration: number): TimeRange {
  const start = clamp(time, 0, Math.max(0, duration - MIN_RANGE_SECONDS))
  const end = range.end - start >= MIN_RANGE_SECONDS ? range.end : duration
  return { start, end }
}

/** Sets the out point (O). If it passes the in point, the in point jumps to the beginning. */
export function withEnd(range: TimeRange, time: number, duration: number): TimeRange {
  const end = clamp(time, Math.min(MIN_RANGE_SECONDS, duration), duration)
  const start = end - range.start >= MIN_RANGE_SECONDS ? range.start : 0
  return { start, end }
}

/** Moves the whole selection keeping its length (dragging the selected band). */
export function shiftRange(range: TimeRange, delta: number, duration: number): TimeRange {
  const length = rangeDuration(range)
  const start = clamp(range.start + delta, 0, Math.max(0, duration - length))
  return { start, end: start + length }
}
