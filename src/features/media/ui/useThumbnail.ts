import { useEffect, useState } from 'react'
import { api } from '@shared/ui/api'

/**
 * Last preview seen of each file: a list that mounts again (switching tabs, clearing a search)
 * paints its previews at once instead of blank cards, while the fresh one is asked for.
 */
const seen = new Map<string, string>()
const keyOf = (path: string, atSec?: number): string => `${path}\n${atSec ?? ''}`

/** Media URL of a JPG preview; `enabled` lets lists wait until the row is on screen. */
export function useThumbnail(path: string | null, atSec?: number, enabled = true): string | null {
  const [url, setUrl] = useState<string | null>(() => (path ? (seen.get(keyOf(path, atSec)) ?? null) : null))

  useEffect(() => {
    if (!path || !enabled) return
    let cancelled = false
    api.media
      .thumbnail(path, atSec)
      .then((result) => {
        seen.set(keyOf(path, atSec), result)
        if (!cancelled) setUrl(result)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [path, atSec, enabled])

  return url
}
