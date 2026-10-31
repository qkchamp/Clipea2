import { describe, expect, it } from 'vitest'
import { heatLevel } from './heat'

describe('heatLevel', () => {
  it('goes from 0 for none to 1 for the most', () => {
    expect(heatLevel(0, 50)).toBe(0)
    expect(heatLevel(50, 50)).toBe(1)
    expect(heatLevel(3, 0)).toBe(0)
  })

  it('keeps small counts visible next to a huge one', () => {
    expect(heatLevel(20, 500)).toBeGreaterThan(0.45)
    expect(heatLevel(1, 500)).toBeLessThan(0.15)
  })
})
