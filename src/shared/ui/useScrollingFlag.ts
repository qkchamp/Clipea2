import { useEffect, type RefObject } from 'react'

const SETTLE_MS = 150

/**
 * Marks a scroller with data-scrolling while it moves (and a moment after). Long lists use it to
 * skip their hover fades: every row sliding under a still pointer would start one, and on a fast
 * monitor each fade repaints the window hundreds of times.
 */
export function useScrollingFlag(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = ref.current
    if (!element) return
    let timer: number | undefined
    const settle = (): void => {
      timer = undefined
      delete element.dataset.scrolling
    }
    const onScroll = (): void => {
      if (timer === undefined) element.dataset.scrolling = ''
      else window.clearTimeout(timer)
      timer = window.setTimeout(settle, SETTLE_MS)
    }
    element.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      element.removeEventListener('scroll', onScroll)
      window.clearTimeout(timer)
      settle()
    }
  }, [ref])
}
