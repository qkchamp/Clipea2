import { describe, expect, it } from 'vitest'
import {
  BLINK_LEAD_SECONDS,
  DEFAULT_EFFECTS,
  PLAIN_LOOK,
  PULSE_AMOUNT,
  clampDuration,
  effectSpans,
  lookAt,
  normalizeEffects,
  removeEffect,
  setEffect,
  type Effect,
  type Timed
} from './effects'

const drawing = (effects: Effect[]): Timed => ({ start: 10, end: 14, effects })

describe('lookAt', () => {
  it('leaves a drawing without effects alone', () => {
    expect(lookAt({ start: 10, end: 14 }, 12)).toBe(PLAIN_LOOK)
    expect(lookAt(drawing([]), 12)).toBe(PLAIN_LOOK)
  })

  it('fades in from its first frame and out towards its end, linearly', () => {
    const faded = drawing([
      { kind: 'fadeIn', duration: 1 },
      { kind: 'fadeOut', duration: 2 }
    ])
    expect(lookAt(faded, 10).opacity).toBe(0)
    expect(lookAt(faded, 10.5).opacity).toBeCloseTo(0.5)
    expect(lookAt(faded, 11).opacity).toBe(1)
    expect(lookAt(faded, 12).opacity).toBe(1)
    expect(lookAt(faded, 13).opacity).toBeCloseTo(0.5)
    expect(lookAt(faded, 14).opacity).toBe(0)
  })

  it('multiplies fades that overlap on a short bar', () => {
    const short = { start: 0, end: 1, effects: [{ kind: 'fadeIn', duration: 1 }, { kind: 'fadeOut', duration: 1 }] as Effect[] }
    expect(lookAt(short, 0.5).opacity).toBeCloseTo(0.25)
  })

  it('zooms from nothing, settling into its size', () => {
    const zoomed = drawing([{ kind: 'zoomIn', duration: 1 }])
    expect(lookAt(zoomed, 10).scale).toBe(0)
    expect(lookAt(zoomed, 10.5).scale).toBeCloseTo(0.875)
    expect(lookAt(zoomed, 11).scale).toBe(1)
    const out = drawing([{ kind: 'zoomOut', duration: 1 }])
    expect(lookAt(out, 13).scale).toBe(1)
    expect(lookAt(out, 13.5).scale).toBeCloseTo(0.875)
    expect(lookAt(out, 14).scale).toBe(0)
  })

  it('slides in from a side and out towards another, a whole frame away at the edge', () => {
    const slides = drawing([
      { kind: 'slideIn', duration: 1, side: 'left' },
      { kind: 'slideOut', duration: 1, side: 'bottom' }
    ])
    expect(lookAt(slides, 10)).toMatchObject({ dx: -1, dy: 0 })
    expect(lookAt(slides, 10.5).dx).toBeCloseTo(-0.125)
    expect(lookAt(slides, 12)).toMatchObject({ dx: 0, dy: 0 })
    expect(lookAt(slides, 14)).toMatchObject({ dx: 0, dy: 1 })
    expect(lookAt(drawing([{ kind: 'slideIn', duration: 1, side: 'right' }]), 10).dx).toBe(1)
    expect(lookAt(drawing([{ kind: 'slideIn', duration: 1, side: 'top' }]), 10).dy).toBe(-1)
  })

  it('blinks on and off at its rate, starting visible', () => {
    // Two blinks a second: visible for a quarter of a second, hidden the next quarter, and so on.
    const blinking = drawing([{ kind: 'blink', rate: 2 }])
    const opacities = [10, 10.2, 10.25, 10.3, 10.5, 10.7, 10.75].map((time) => lookAt(blinking, time).opacity)
    expect(opacities).toEqual([1, 1, 0, 0, 1, 1, 0])
  })

  it('decides a flip that falls on a frame boundary the same way, whatever wobble the frame time has', () => {
    // Recordings put frames a few milliseconds off the even grid: 10.25 may come as 10.2497 or 10.2503.
    const blinking = drawing([{ kind: 'blink', rate: 2 }])
    for (const wobble of [-0.003, -0.0003, 0, 0.0003, 0.003]) {
      expect(lookAt(blinking, 10.25 + wobble).opacity).toBe(0)
      expect(lookAt(blinking, 10.5 + wobble).opacity).toBe(1)
    }
    // Half a frame at 60 fps before a flip is still before it.
    expect(lookAt(blinking, 10.25 - BLINK_LEAD_SECONDS - 0.003).opacity).toBe(1)
  })

  it('pulses between its size and a bit more, once per cycle', () => {
    const pulsing = drawing([{ kind: 'pulse', rate: 1 }])
    expect(lookAt(pulsing, 10).scale).toBeCloseTo(1)
    expect(lookAt(pulsing, 10.5).scale).toBeCloseTo(1 + PULSE_AMOUNT)
    expect(lookAt(pulsing, 11).scale).toBeCloseTo(1)
  })
})

describe('effect lists', () => {
  it('keeps one effect per kind, in a fixed order', () => {
    const list = setEffect([DEFAULT_EFFECTS.fadeOut], DEFAULT_EFFECTS.fadeIn)
    expect(list.map((effect) => effect.kind)).toEqual(['fadeIn', 'fadeOut'])
    const changed = setEffect(list, { kind: 'fadeIn', duration: 2 })
    expect(changed).toHaveLength(2)
    expect(changed[0]).toEqual({ kind: 'fadeIn', duration: 2 })
    expect(removeEffect(changed, 'fadeIn').map((effect) => effect.kind)).toEqual(['fadeOut'])
  })

  it('keeps a duration between a tenth of a second and the bar', () => {
    expect(clampDuration(0.01, 5)).toBe(0.1)
    expect(clampDuration(9, 5)).toBe(5)
    expect(clampDuration(0.5, 0.05)).toBe(0.1)
  })
})

describe('normalizeEffects', () => {
  it('drops what is not an effect and repeated kinds, and clamps what is out of range', () => {
    const cleaned = normalizeEffects([
      { kind: 'fadeIn', duration: 0.5 },
      { kind: 'fadeIn', duration: 9 },
      { kind: 'fadeOut', duration: 'mucho' },
      { kind: 'slideIn', duration: 1, side: 'diagonal' },
      { kind: 'slideOut', duration: 99999, side: 'top' },
      { kind: 'blink', rate: 1000 },
      { kind: 'pulse' },
      { kind: 'explode', duration: 1 },
      null,
      7
    ])
    expect(cleaned).toEqual([
      { kind: 'fadeIn', duration: 0.5 },
      { kind: 'slideOut', duration: 600, side: 'top' },
      { kind: 'blink', rate: 8 }
    ])
    expect(normalizeEffects('fadeIn')).toEqual([])
    expect(normalizeEffects(undefined)).toEqual([])
    expect(normalizeEffects([{ kind: 'fadeIn', duration: Number.NaN }])).toEqual([])
  })
})

describe('effectSpans', () => {
  it('places in effects at the start of the bar, out effects at the end and loops over all of it', () => {
    const spans = effectSpans(
      drawing([
        { kind: 'fadeIn', duration: 1 },
        { kind: 'zoomOut', duration: 0.5 },
        { kind: 'blink', rate: 2 }
      ])
    )
    expect(spans).toEqual([
      { kind: 'fadeIn', from: 10, to: 11 },
      { kind: 'zoomOut', from: 13.5, to: 14 },
      { kind: 'blink', from: 10, to: 14 }
    ])
  })

  it('never goes past the bar', () => {
    expect(effectSpans({ start: 0, end: 0.3, effects: [{ kind: 'fadeIn', duration: 2 }, { kind: 'fadeOut', duration: 2 }] })).toEqual([
      { kind: 'fadeIn', from: 0, to: 0.3 },
      { kind: 'fadeOut', from: 0, to: 0.3 }
    ])
  })
})
