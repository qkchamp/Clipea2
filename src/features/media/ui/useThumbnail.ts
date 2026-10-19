import { useEffect, useState } from 'react'
import { api } from '@shared/ui/api'

/** Media URL of a JPG preview; `enabled` lets lists wait until the row is on screen. */
export function useThumbnail(path: string | null, atSec?: number, enabled = true): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!path || !enabled) return
    let cancelled = false
    api.media
      .thumbnail(path, atSec)
      .then((result) => !cancelled && setUrl(result))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [path, atSec, enabled])

  return url
}
