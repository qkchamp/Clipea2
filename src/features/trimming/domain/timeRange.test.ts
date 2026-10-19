import { describe, expect, it } from 'vitest'
import { isValidRange, rangeDuration, shiftRange, withEnd, withStart } from './timeRange'

describe('in/out points', () => {
  const duration = 60

  it('sets the in point like HandBrake seconds 50 → 60', () => {
    const range = withEnd(withStart({ start: 0, end: 60 }, 50, duration), 60, duration)
    expect(range).toEqual({ start: 50, end: 60 })
    expect(rangeDuration(range)).toBe(10)
  })

  it('moves the out point to the end when the in point passes it', () => {
    expect(withStart({ start: 10, end: 20 }, 30, duration)).toEqual({ start: 30, end: 60 })
  })

  it('moves the in point to the start when the out point passes it', () => {
    expect(withEnd({ start: 30, end: 40 }, 20, duration)).toEqual({ start: 0, end: 20 })
  })

  it('clamps to the video length', () => {
    expect(withEnd({ start: 0, end: 10 }, 90, duration).end).toBe(60)
    expect(withStart({ start: 0, end: 60 }, -5, duration).start).toBe(0)
  })

  it('shifts a selection without changing its length', () => {
    expect(shiftRange({ start: 50, end: 58 }, 5, duration)).toEqual({ start: 52, end: 60 })
    expect(shiftRange({ start: 2, end: 4 }, -5, duration)).toEqual({ start: 0, end: 2 })
  })

  it('rejects empty selections', () => {
    expect(isValidRange({ start: 5, end: 5 })).toBe(false)
    expect(isValidRange({ start: 5, end: 5.1 })).toBe(true)
  })
})
