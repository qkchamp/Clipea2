import { clamp } from '@shared/domain/time'
import type { FrameIndex } from '@features/media/domain/frameIndex'

/** What the player knows about frame timing for the loaded video. */
export interface FrameClock {
  fps: number
  duration: number
  /** Exact frame table when available; until it loads, timing falls back to `fps`. */
  index: FrameIndex | null
}

export function frameDuration(clock: FrameClock): number {
  return clock.index?.nominalFrameDuration ?? 1 / clock.fps
}

export function totalFrames(clock: FrameClock): number {
  return clock.index ? clock.index.count : Math.max(1, Math.round(clock.duration * clock.fps))
}

export function frameNumberAt(clock: FrameClock, time: number): number {
  if (clock.index) return clock.index.indexAt(time)
  return clamp(Math.floor(time * clock.fps + 1e-6), 0, totalFrames(clock) - 1)
}

/** Start time of the frame shown at `time`; annotations are pinned to it. */
export function frameStartTime(clock: FrameClock, time: number): number {
  if (clock.index) return clock.index.timeOf(clock.index.indexAt(time))
  return frameNumberAt(clock, time) / clock.fps
}

/** End of the frame shown at `time` (start of the next one): an out point there keeps that frame. */
export function frameEndTime(clock: FrameClock, time: number): number {
  if (clock.index) {
    const index = clock.index.indexAt(time)
    const end = index + 1 < clock.index.count ? clock.index.timeOf(index + 1) : clock.index.timeOf(index) + clock.index.nominalFrameDuration
    return Math.min(end, clock.duration || end)
  }
  return Math.min((frameNumberAt(clock, time) + 1) / clock.fps, clock.duration)
}

/** Seek target for moving `delta` frames from `time` (Ctrl+← / Ctrl+→). */
export function frameStepTarget(clock: FrameClock, time: number, delta: number): number {
  const target = clamp(frameNumberAt(clock, time) + delta, 0, totalFrames(clock) - 1)
  if (clock.index) return clock.index.seekTimeOf(target)
  return Math.min((target + 0.5) / clock.fps, clock.duration)
}
