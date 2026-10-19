import { describe, expect, it } from 'vitest'
import { parseRange } from './httpRange'

describe('parseRange', () => {
  it('reads open and closed ranges', () => {
    expect(parseRange('bytes=0-', 1000)).toEqual({ start: 0, end: 999 })
    expect(parseRange('bytes=100-199', 1000)).toEqual({ start: 100, end: 199 })
  })

  it('reads suffix ranges', () => {
    expect(parseRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 })
  })

  it('clamps the end to the file size', () => {
    expect(parseRange('bytes=900-5000', 1000)).toEqual({ start: 900, end: 999 })
  })

  it('returns null without a header and flags unsatisfiable ranges', () => {
    expect(parseRange(null, 1000)).toBeNull()
    expect(parseRange('bytes=2000-', 1000)).toBe('invalid')
    expect(parseRange('bytes=0-1,5-6', 1000)).toBe('invalid')
  })
})
