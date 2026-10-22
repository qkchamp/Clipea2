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
