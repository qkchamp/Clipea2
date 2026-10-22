import { describe, expect, it } from 'vitest'
import type { Shape } from './annotation'
import { OUTLINE_PAD, TEXT_WIDTH_RANGE, handleAt, handlesOf, resizeShape, shapeAt, shapeBox, type TextMeasure } from './shapeGeometry'

const style = { color: '#fff', width: 0.005 }
const frame = { width: 1000, height: 500 }
const measure: TextMeasure = () => ({ width: 120, height: 30 })
const at = (x: number, y: number) => ({ x, y })

const rect: Shape = { kind: 'rect', from: at(0.1, 0.1), to: at(0.5, 0.9), style }
const arrow: Shape = { kind: 'arrow', from: at(0.2, 0.5), to: at(0.4, 0.5), style }
const text: Shape = { kind: 'text', at: at(0.7, 0.2), text: 'hola', style }
const ellipse: Shape = { kind: 'ellipse', from: at(0.6, 0.5), to: at(0.9, 0.9), style }
const items = [rect, arrow, text, ellipse].map((shape, index) => ({ id: String(index), shape }))

const pick = (x: number, y: number) => shapeAt(items, at(x, y), frame, measure, 6)?.id

describe('shapeAt', () => {
  it('grabs strokes, arrows and texts', () => {
    expect(pick(100, 200)).toBe('0')
    expect(pick(300, 252)).toBe('1')
    expect(pick(760, 110)).toBe('2')
    expect(pick(900, 350)).toBe('3')
  })

  it('prefers a stroke drawn inside a rectangle over the rectangle itself', () => {
    expect(pick(300, 250)).toBe('1')
    expect(pick(300, 120)).toBe('0')
  })

  it('misses empty spots', () => {
    expect(pick(560, 30)).toBeUndefined()
  })
})

describe('shapeBox', () => {
  it('measures texts from their top left corner', () => {
    expect(shapeBox(text, frame, measure)).toEqual({ left: 700, top: 100, width: 120, height: 30 })
  })
})

describe('handlesOf', () => {
  it('puts eight grips on the outline of a rectangle, corners first', () => {
    const handles = handlesOf(rect, frame, measure)
    expect(handles.map((handle) => handle.id)).toEqual(['nw', 'ne', 'se', 'sw', 'n', 'e', 's', 'w'])
    expect(handles[0]).toEqual({ id: 'nw', x: 100 - OUTLINE_PAD, y: 50 - OUTLINE_PAD })
    expect(handles[2]).toEqual({ id: 'se', x: 500 + OUTLINE_PAD, y: 450 + OUTLINE_PAD })
    expect(handles[4]).toMatchObject({ id: 'n', x: 300, y: 50 - OUTLINE_PAD })
  })

  it('gives an arrow a grip on each end and a text one on each corner', () => {
    expect(handlesOf(arrow, frame, measure)).toEqual([
      { id: 'from', x: 200, y: 250 },
      { id: 'to', x: 400, y: 250 }
    ])
    expect(handlesOf(text, frame, measure).map((handle) => handle.id)).toEqual(['nw', 'ne', 'se', 'sw'])
  })

  it('picks the first grip within reach, so corners beat the sides of a tiny shape', () => {
    const tiny: Shape = { kind: 'rect', from: at(0.5, 0.5), to: at(0.51, 0.52), style }
    const handles = handlesOf(tiny, frame, measure)
    expect(handleAt(handles, { x: handles[0].x + 2, y: handles[0].y - 1 }, 8)?.id).toBe('nw')
    expect(handleAt(handles, { x: 10, y: 10 }, 8)).toBeUndefined()
  })
})

describe('resizeShape', () => {
  it('moves the sides a grip belongs to and keeps the rest of a rectangle', () => {
    const wider = resizeShape(rect, 'e', at(0.2, 0.3), frame, measure)
    expect(wider).toMatchObject({ from: at(0.1, 0.1), to: { x: expect.closeTo(0.7), y: 0.9 } })
    const corner = resizeShape(rect, 'nw', at(0.05, 0.1), frame, measure)
    expect(corner).toMatchObject({ from: { x: expect.closeTo(0.15), y: expect.closeTo(0.2) }, to: at(0.5, 0.9) })
  })

  it('turns a rectangle over when a grip crosses the opposite side', () => {
    const flipped = resizeShape(rect, 'e', at(-0.6, 0), frame, measure)
    const xs = [(flipped as typeof rect).from.x, (flipped as typeof rect).to.x]
    expect(xs[0]).toBeCloseTo(0.1)
    expect(xs[1]).toBeCloseTo(-0.1)
  })

  it('resizes an ellipse like a rectangle and an arrow by one end', () => {
    expect(resizeShape(ellipse, 'se', at(0.05, 0.05), frame, measure)).toMatchObject({ to: { x: expect.closeTo(0.95), y: expect.closeTo(0.95) } })
    expect(resizeShape(arrow, 'to', at(0.1, 0.2), frame, measure)).toMatchObject({ from: at(0.2, 0.5), to: { x: expect.closeTo(0.5), y: expect.closeTo(0.7) } })
    expect(resizeShape(arrow, 'from', at(-0.1, 0), frame, measure)).toMatchObject({ from: { x: expect.closeTo(0.1), y: 0.5 }, to: at(0.4, 0.5) })
  })

  it('stretches the points of a stroke with its box', () => {
    const pen: Shape = { kind: 'pen', points: [at(0.2, 0.2), at(0.3, 0.4), at(0.4, 0.2)], style }
    const taller = resizeShape(pen, 's', at(0, 0.2), frame, measure) as typeof pen
    expect(taller.points.map((point) => [point.x, point.y])).toEqual([
      [0.2, expect.closeTo(0.2)],
      [0.3, expect.closeTo(0.6)],
      [0.4, expect.closeTo(0.2)]
    ])
    const smaller = resizeShape(pen, 'nw', at(0.1, 0.1), frame, measure) as typeof pen
    expect(smaller.points[0]).toMatchObject({ x: expect.closeTo(0.3), y: expect.closeTo(0.3) })
    expect(smaller.points[2]).toMatchObject({ x: expect.closeTo(0.4), y: expect.closeTo(0.3) })
  })

  it('leaves a flat stroke alone along the axis it has no length on', () => {
    const line: Shape = { kind: 'pen', points: [at(0.2, 0.5), at(0.4, 0.5)], style }
    const result = resizeShape(line, 's', at(0, 0.2), frame, measure) as typeof line
    expect(result.points.map((point) => point.y)).toEqual([0.5, 0.5])
  })

  it('scales a text from the opposite corner, which stays where it is', () => {
    // The fake measure ignores the size, so only the stroke width and the anchored corner are checked.
    const grown = resizeShape(text, 'se', at(0.1, 0.1), frame, measure) as typeof text
    expect(grown.style.width).toBeGreaterThan(text.style.width)
    expect(grown.at).toEqual(text.at)
    const shrunk = resizeShape(text, 'se', at(-0.05, -0.05), frame, measure) as typeof text
    expect(shrunk.style.width).toBeLessThan(text.style.width)
    const fromTopLeft = resizeShape(text, 'nw', at(-0.05, -0.05), frame, measure) as typeof text
    expect(fromTopLeft.style.width).toBeGreaterThan(text.style.width)
    // The bottom right corner of the box (820, 130) stays: the new top left is (820, 130) minus the size.
    expect(fromTopLeft.at.x * frame.width).toBeCloseTo(820 - 120)
    expect(fromTopLeft.at.y * frame.height).toBeCloseTo(130 - 30)
  })

  it('keeps a text between a readable size and a huge one, and ignores its sides', () => {
    const tiny = resizeShape(text, 'se', at(-5, -5), frame, measure) as typeof text
    expect(tiny.style.width).toBe(TEXT_WIDTH_RANGE.min)
    const huge = resizeShape(text, 'se', at(5, 5), frame, measure) as typeof text
    expect(huge.style.width).toBe(TEXT_WIDTH_RANGE.max)
    expect(resizeShape(text, 'e', at(0.2, 0), frame, measure)).toBe(text)
  })
})
