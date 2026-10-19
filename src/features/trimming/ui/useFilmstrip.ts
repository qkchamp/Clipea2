import { useEffect, useState } from 'react'
import { clamp } from '@shared/domain/time'
import { api } from '@shared/ui/api'

/** Evenly spaced thumbnails of the whole video for the timeline background. */
export function useFilmstrip(path: string | null, duration: number): string[] {
  const [frames, setFrames] = useState<string[]>([])
  const count = duration > 0 ? Math.round(clamp(duration / 2.5, 12, 48)) : 0

  useEffect(() => {
    setFrames([])
    if (!path || count === 0) return
    let cancelled = false
    api.media
      .filmstrip(path, count)
      .then((urls) => !cancelled && setFrames(urls))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [path, count])

  return frames
}
