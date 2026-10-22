import { describe, expect, it } from 'vitest'
import { clampChannel, hexToRgb, inkOn, parseHex, rgbToHex } from './color'

describe('color', () => {
  it('goes from hex to channels and back', () => {
    expect(hexToRgb('#ff3b30')).toEqual({ r: 255, g: 59, b: 48 })
    expect(hexToRgb('#0AB4FF')).toEqual({ r: 10, g: 180, b: 255 })
    expect(rgbToHex({ r: 255, g: 59, b: 48 })).toBe('#ff3b30')
    expect(rgbToHex({ r: 0, g: 0, b: 0 })).toBe('#000000')
  })

  it('clamps and rounds channels', () => {
    expect(rgbToHex({ r: 300, g: -5, b: 127.6 })).toBe('#ff0080')
    expect(clampChannel(Number.NaN)).toBe(0)
  })

  it('reads anything that is not a six digit hex as black', () => {
    expect(hexToRgb('red')).toEqual({ r: 0, g: 0, b: 0 })
    expect(hexToRgb('#fff')).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('reads a color typed by hand, with or without #', () => {
    expect(parseHex('#FFC389')).toEqual({ r: 255, g: 195, b: 137 })
    expect(parseHex('  ffc389 ')).toEqual({ r: 255, g: 195, b: 137 })
    expect(parseHex('#ffc38')).toBeNull()
    expect(parseHex('#ffc38g')).toBeNull()
    expect(parseHex('rojo')).toBeNull()
  })

  it('takes three digits only when asked (when the typing is done)', () => {
    expect(parseHex('#fc8')).toBeNull()
    expect(parseHex('#fc8', true)).toEqual({ r: 255, g: 204, b: 136 })
    expect(parseHex('FC8', true)).toEqual({ r: 255, g: 204, b: 136 })
  })

  it('picks dark ink on light colors and white ink on dark ones', () => {
    expect(inkOn('#ffc389')).toBe('#111111')
    expect(inkOn('#ffffff')).toBe('#111111')
    expect(inkOn('#ffd60a')).toBe('#111111')
    expect(inkOn('#1a237e')).toBe('#ffffff')
    expect(inkOn('#000000')).toBe('#ffffff')
    expect(inkOn('#ff2daa')).toBe('#111111')
  })
})
