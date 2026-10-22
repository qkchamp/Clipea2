export interface Rgb {
  r: number
  g: number
  b: number
}

const channel = (value: number): number => Math.min(255, Math.max(0, Math.round(Number.isFinite(value) ? value : 0)))

/** "#ff3b30" (any case) → its channels; anything else is black. */
export function hexToRgb(hex: string): Rgb {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!match) return { r: 0, g: 0, b: 0 }
  return { r: parseInt(match[1], 16), g: parseInt(match[2], 16), b: parseInt(match[3], 16) }
}

/**
 * A color typed by hand: "#ffc389" or "ffc389", any case, spaces around ignored. With `short`,
 * three digits work too ("#fc8" is "#ffcc88"). Anything else is null.
 */
export function parseHex(text: string, short = false): Rgb | null {
  const digits = text.trim().replace(/^#/, '')
  if (/^[0-9a-f]{6}$/i.test(digits)) return hexToRgb(`#${digits}`)
  if (short && /^[0-9a-f]{3}$/i.test(digits)) return hexToRgb(`#${[...digits].map((digit) => digit + digit).join('')}`)
  return null
}

/** Channels (0..255, clamped and rounded) → "#rrggbb". */
export function rgbToHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((value) => channel(value).toString(16).padStart(2, '0')).join('')}`
}

export const clampChannel = channel

/** Ink that reads on top of a color: dark on light colors, white on dark ones (by its WCAG luminance). */
export function inkOn(hex: string): '#ffffff' | '#111111' {
  const linear = (value: number): number => {
    const unit = value / 255
    return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4
  }
  const { r, g, b } = hexToRgb(hex)
  const luminance = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
  // Where black and white text have the same contrast on it.
  return luminance > 0.179 ? '#111111' : '#ffffff'
}
