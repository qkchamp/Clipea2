import { clamp } from '@shared/domain/time'

/** How much one notch of the mouse wheel moves the volume. */
export const VOLUME_STEP = 0.05

/** The volume (0 to 1) as the whole percentage the user reads and types. */
export function volumePercent(volume: number): number {
  return Math.round(volume * 100)
}

/** A typed percentage ("75", "75%", "12,5 %") as a volume from 0 to 1; null when it isn't a number. */
export function parseVolumePercent(text: string): number | null {
  const match = /^\s*(\d+(?:[.,]\d+)?)\s*%?\s*$/.exec(text)
  if (!match) return null
  return clamp(Number(match[1].replace(',', '.')), 0, 100) / 100
}

/** One wheel notch up or down from the current volume, on the 5% grid and within 0 to 1. */
export function stepVolume(volume: number, direction: 1 | -1): number {
  const snapped = Math.round(volume / VOLUME_STEP) * VOLUME_STEP
  return clamp(Math.round((snapped + direction * VOLUME_STEP) * 100) / 100, 0, 1)
}
