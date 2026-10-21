import { describe, expect, it } from 'vitest'
import type { Shape } from './annotation'
import { shapeAt, shapeBox, type TextMeasure } from './shapeGeometry'

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
