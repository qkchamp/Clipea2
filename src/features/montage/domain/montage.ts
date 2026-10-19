import { clamp } from '@shared/domain/time'

/** A piece of one recording that goes into the final clip. */
export interface Segment {
  readonly id: string
  readonly sourcePath: string
  readonly sourceLabel: string
  readonly start: number
  readonly end: number
}

/** Ordered list of segments, possibly from different recordings. */
export type Montage = readonly Segment[]

export function segmentDuration(segment: Segment): number {
  return Math.max(0, segment.end - segment.start)
}

export function montageDuration(montage: Montage): number {
  return montage.reduce((total, segment) => total + segmentDuration(segment), 0)
}

export function appendSegment(montage: Montage, segment: Segment): Montage {
  return [...montage, segment]
}

export function removeSegment(montage: Montage, id: string): Montage {
  return montage.filter((segment) => segment.id !== id)
}

export function moveSegment(montage: Montage, from: number, to: number): Montage {
  if (montage.length === 0) return montage
  const source = clamp(from, 0, montage.length - 1)
  const target = clamp(to, 0, montage.length - 1)
  if (source === target) return montage
  const next = [...montage]
  const [moved] = next.splice(source, 1)
  next.splice(target, 0, moved)
  return next
}

export function updateSegmentRange(montage: Montage, id: string, start: number, end: number): Montage {
  return montage.map((segment) => (segment.id === id ? { ...segment, start, end } : segment))
}

/** Where each segment starts in the final clip. */
export function segmentOffsets(montage: Montage): number[] {
  const offsets: number[] = []
  let cursor = 0
  for (const segment of montage) {
    offsets.push(cursor)
    cursor += segmentDuration(segment)
  }
  return offsets
}
