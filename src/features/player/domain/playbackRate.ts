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
