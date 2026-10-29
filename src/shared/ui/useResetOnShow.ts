import { useLayoutEffect, useRef } from 'react'

/**
 * The side panels stay mounted behind their tab (Activity) so switching tabs only hides and shows
 * them. Each time the panel shows again, `reset` runs before it paints: it opens like a new one.
 * `reset` should only call state setters and read stores: the first one given is the one used.
 */
export function useResetOnShow(reset: () => void): void {
  const shown = useRef(false)
  useLayoutEffect(() => {
    if (shown.current) reset()
    shown.current = true
  }, [])
}
