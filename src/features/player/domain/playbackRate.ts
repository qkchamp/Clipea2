import { clamp } from '@shared/domain/time'

/** Starts at 1.00x and moves in 0.25x steps with Ctrl+↑ / Ctrl+↓. */
export const PLAYBACK_RATE = { min: 0.25, max: 4, step: 0.25, normal: 1 } as const

export function stepPlaybackRate(current: number, direction: 1 | -1): number {
  const snapped = Math.round(current / PLAYBACK_RATE.step) * PLAYBACK_RATE.step
  const next = snapped + direction * PLAYBACK_RATE.step
  return clamp(Math.round(next * 100) / 100, PLAYBACK_RATE.min, PLAYBACK_RATE.max)
}

export function formatPlaybackRate(rate: number): string {
  return `${rate.toFixed(2)}x`
}

/** A typed speed ("1.5", "1,5x") kept within the allowed range; null when it isn't a number. */
export function parsePlaybackRate(text: string): number | null {
  const match = /^\s*(\d+(?:[.,]\d+)?)\s*x?\s*$/i.exec(text)
  if (!match) return null
  const rate = Math.round(Number(match[1].replace(',', '.')) * 100) / 100
  return clamp(rate, PLAYBACK_RATE.min, PLAYBACK_RATE.max)
}

/** Where a speed sits between the slowest (0) and the fastest (1), for the speed slider. */
export function playbackRateFraction(rate: number): number {
  return (rate - PLAYBACK_RATE.min) / (PLAYBACK_RATE.max - PLAYBACK_RATE.min)
}
