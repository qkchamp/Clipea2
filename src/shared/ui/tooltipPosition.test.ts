import { describe, expect, it } from 'vitest'
import { placeTooltip } from './tooltipPosition'

const viewport = { width: 1000, height: 800 }
const tip = { width: 120, height: 24 }

describe('placeTooltip', () => {
  it('goes under the element, centered on it', () => {
    expect(placeTooltip({ left: 400, top: 100, width: 40, height: 30 }, tip, viewport)).toEqual({ left: 360, top: 136 })
  })

  it('goes above when there is no room below', () => {
    expect(placeTooltip({ left: 400, top: 760, width: 40, height: 30 }, tip, viewport)).toEqual({ left: 360, top: 730 })
  })

  it('stays inside the window at both edges', () => {
    expect(placeTooltip({ left: 0, top: 100, width: 20, height: 20 }, tip, viewport).left).toBe(6)
    expect(placeTooltip({ left: 980, top: 100, width: 20, height: 20 }, tip, viewport).left).toBe(874)
  })
})
