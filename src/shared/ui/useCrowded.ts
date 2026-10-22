import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { FRESH_MEMORY, nextCrowded } from './crowding'

/** Width the row would need to hold all its children on one line. */
function oneLineWidth(row: HTMLElement): number {
  const style = getComputedStyle(row)
  const children = [...row.children]
  const gaps = (parseFloat(style.columnGap) || 0) * Math.max(0, children.length - 1)
  const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
  return children.reduce((sum, child) => sum + child.getBoundingClientRect().width, gaps + padding)
}

/** Room for the row's content: its own width, or for a row sized to its content, what its parent leaves. */
function roomFor(row: HTMLElement, within: 'self' | 'parent'): number {
  const parent = row.parentElement
  if (within === 'self' || !parent) return row.clientWidth
  const style = getComputedStyle(parent)
  const borders = row.offsetWidth - row.clientWidth
  return parent.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - borders
}

/**
 * True while a row can't fit its children on one line, so it can switch to a compact layout
 * before it wraps. It goes back as soon as the full layout fits again (see nextCrowded for how it
 * decides without flickering between both layouts). `within: 'parent'` is for rows that
 * only take the width they need (a centered toolbar): the room is then what the parent offers.
 *
 * After switching layout it waits two frames before measuring again: the row's own styles can
 * arrive a frame after its buttons change (seen in the app without DevTools attached), and deciding
 * on that half-switched row made the toolbar flip forever.
 */
export function useCrowded(ref: RefObject<HTMLElement | null>, within: 'self' | 'parent' = 'self'): boolean {
  const [crowded, setCrowded] = useState(false)
  // Which layout is on screen, for the measurements (updated in the same commit that renders it).
  const shown = useRef(false)

  useLayoutEffect(() => {
    shown.current = crowded
  }, [crowded])

  useLayoutEffect(() => {
    const row = ref.current
    if (!row) return
    let memory = FRESH_MEMORY
    // Animation frame of the wait after a switch; 0 when measurements count.
    let settling = 0
    const check = (): void => {
      if (settling) return
      const compact = shown.current
      const next = nextCrowded(compact, oneLineWidth(row), roomFor(row, within), memory)
      memory = next.memory
      if (next.crowded === compact) return
      setCrowded(next.crowded)
      settling = requestAnimationFrame(() => {
        settling = requestAnimationFrame(() => {
          settling = 0
          check()
        })
      })
    }
    // The children too: the clock changes width with the clip and the frame number.
    const observer = new ResizeObserver(check)
    observer.observe(row)
    for (const child of row.children) observer.observe(child)
    if (within === 'parent' && row.parentElement) observer.observe(row.parentElement)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(settling)
    }
  }, [ref, within])

  return crowded
}
