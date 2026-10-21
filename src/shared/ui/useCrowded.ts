import { useLayoutEffect, useState, type RefObject } from 'react'

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
 * before it wraps. It goes back as soon as the full layout fits again: what compacting saves is
 * measured once, so the decision follows the row's content (the clock gets wider or narrower
 * from clip to clip) without flickering between both layouts. `within: 'parent'` is for rows that
 * only take the width they need (a centered toolbar): the room is then what the parent offers.
 */
export function useCrowded(ref: RefObject<HTMLElement | null>, within: 'self' | 'parent' = 'self'): boolean {
  const [crowded, setCrowded] = useState(false)

  // Mirrored on the row so each measurement knows which layout is on screen.
  useLayoutEffect(() => {
    ref.current?.toggleAttribute('data-crowded', crowded)
  }, [ref, crowded])

  useLayoutEffect(() => {
    const row = ref.current
    if (!row) return
    let fullWidth = 0
    let saved: number | null = null
    const check = (): void => {
      const needed = oneLineWidth(row)
      const room = roomFor(row, within)
      if (!row.hasAttribute('data-crowded')) {
        fullWidth = needed
        if (needed > room + 0.5) setCrowded(true)
        return
      }
      saved ??= Math.max(0, fullWidth - needed)
      if (needed + saved <= room + 0.5) setCrowded(false)
    }
    // The children too: the clock changes width with the clip and the frame number.
    const observer = new ResizeObserver(check)
    observer.observe(row)
    for (const child of row.children) observer.observe(child)
    if (within === 'parent' && row.parentElement) observer.observe(row.parentElement)
    return () => observer.disconnect()
  }, [ref, within])

  return crowded
}
