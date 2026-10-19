import { useMemo } from 'react'
import { useMediaStore } from '@features/media/ui/mediaStore'
import type { FrameClock } from '../domain/frameClock'
import { usePlayerStore } from './playerStore'

function clockOf(
  duration: number,
  fps: number | undefined,
  probedDuration: number | undefined,
  index: FrameClock['index'] | undefined
): FrameClock {
  return { fps: fps ?? 30, duration: duration || probedDuration || 0, index: index ?? null }
}

/** Frame timing of the loaded video (exact once its frame table arrives). */
export function useFrameClock(): FrameClock {
  const sourcePath = usePlayerStore((state) => state.sourcePath)
  const duration = usePlayerStore((state) => state.duration)
  const info = useMediaStore((state) => (sourcePath ? state.infos[sourcePath] : undefined))
  const index = useMediaStore((state) => (sourcePath ? state.frameIndexes[sourcePath] : undefined))
  return useMemo(() => clockOf(duration, info?.video?.fps, info?.durationSec, index), [duration, info, index])
}

/** Same as useFrameClock, for event handlers. */
export function getFrameClock(): FrameClock {
  const { sourcePath, duration } = usePlayerStore.getState()
  const media = useMediaStore.getState()
  const info = sourcePath ? media.infos[sourcePath] : undefined
  const index = sourcePath ? media.frameIndexes[sourcePath] : undefined
  return clockOf(duration, info?.video?.fps, info?.durationSec, index)
}
