import { describe, expect, it } from 'vitest'
import {
  appendSegment,
  montageDuration,
  moveSegment,
  removeSegment,
  segmentOffsets,
  updateSegmentRange,
  type Segment
} from './montage'

const segment = (id: string, start: number, end: number, sourcePath = 'a.mp4'): Segment => ({
  id,
  sourcePath,
  sourceLabel: sourcePath,
  start,
  end
})

describe('montage', () => {
  const montage = [segment('a', 50, 60), segment('b', 10, 13, 'b.mp4'), segment('c', 0, 5)]

  it('adds durations of pieces from different videos', () => {
    expect(montageDuration(montage)).toBe(18)
    expect(segmentOffsets(montage)).toEqual([0, 10, 13])
  })

  it('appends and removes segments', () => {
    expect(appendSegment([], segment('x', 1, 2))).toHaveLength(1)
    expect(removeSegment(montage, 'b').map((s) => s.id)).toEqual(['a', 'c'])
  })

  it('reorders segments', () => {
    expect(moveSegment(montage, 0, 2).map((s) => s.id)).toEqual(['b', 'c', 'a'])
    expect(moveSegment(montage, 2, 0).map((s) => s.id)).toEqual(['c', 'a', 'b'])
    expect(moveSegment(montage, 1, 99).map((s) => s.id)).toEqual(['a', 'c', 'b'])
  })

  it('edits one segment range', () => {
    expect(updateSegmentRange(montage, 'c', 1, 4)[2]).toMatchObject({ start: 1, end: 4 })
  })
})
