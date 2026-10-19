export interface Box {
  left: number
  top: number
  width: number
  height: number
}

interface Size {
  width: number
  height: number
}

const GAP = 6
const MARGIN = 6

/** Under the element and centered on it, above it when there's no room below, always inside the window. */
export function placeTooltip(anchor: Box, tip: Size, viewport: Size): { left: number; top: number } {
  const below = anchor.top + anchor.height + GAP
  const top = below + tip.height + MARGIN <= viewport.height ? below : Math.max(MARGIN, anchor.top - GAP - tip.height)
  const centered = anchor.left + anchor.width / 2 - tip.width / 2
  const left = Math.min(Math.max(MARGIN, centered), Math.max(MARGIN, viewport.width - tip.width - MARGIN))
  return { left: Math.round(left), top: Math.round(top) }
}
