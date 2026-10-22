import type { Point, Shape } from './annotation'

/** Rectangle in pixels of the frame on screen. */
export interface Box {
  left: number
  top: number
  width: number
  height: number
}

export interface FrameSize {
  width: number
  height: number
}

export type TextShape = Extract<Shape, { kind: 'text' }>

/** Pixel size of a text drawing: only the canvas knows the font, so it measures. */
export type TextMeasure = (shape: TextShape) => { width: number; height: number }

/** Space between a shape and the dashed outline drawn around it when it is picked. */
export const OUTLINE_PAD = 6

/**
 * Stroke widths a text can be resized to. A text's size comes from its stroke width (the same
 * picker that sets it when drawing it), so resizing a text means changing that.
 */
export const TEXT_WIDTH_RANGE = { min: 0.0035, max: 0.12 }

const toPx = (point: Point, frame: FrameSize): Point => ({ x: point.x * frame.width, y: point.y * frame.height })

function boxOf(points: readonly Point[]): Box {
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top }
}

function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = dx * dx + dy * dy
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length))
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy))
}

const inside = (point: Point, box: Box, margin: number): boolean =>
  point.x >= box.left - margin &&
  point.x <= box.left + box.width + margin &&
  point.y >= box.top - margin &&
  point.y <= box.top + box.height + margin

/** Pixel rectangle the shape covers, used to outline the selected one. */
export function shapeBox(shape: Shape, frame: FrameSize, measure: TextMeasure): Box {
  switch (shape.kind) {
    case 'pen':
      return boxOf(shape.points.map((point) => toPx(point, frame)))
    case 'text': {
      const at = toPx(shape.at, frame)
      return { left: at.x, top: at.y, ...measure(shape) }
    }
    default:
      return boxOf([toPx(shape.from, frame), toPx(shape.to, frame)])
  }
}

/**
 * Whether a click at `point` (pixels) grabs the shape. `edge` only counts the stroke itself (and a
 * text's box); `inside` also counts the area inside rectangles and circles, so they can be grabbed
 * anywhere once nothing is drawn on top of that spot.
 */
export function hitsShape(
  shape: Shape,
  point: Point,
  frame: FrameSize,
  measure: TextMeasure,
  tolerance: number,
  mode: 'edge' | 'inside'
): boolean {
  const reach = tolerance + (shape.style.width * frame.height) / 2
  switch (shape.kind) {
    case 'pen': {
      const points = shape.points.map((p) => toPx(p, frame))
      if (points.length === 1) return Math.hypot(point.x - points[0].x, point.y - points[0].y) <= reach
      return points.some((p, index) => index > 0 && distanceToSegment(point, points[index - 1], p) <= reach)
    }
    case 'arrow':
      return distanceToSegment(point, toPx(shape.from, frame), toPx(shape.to, frame)) <= reach
    case 'text':
      return inside(point, shapeBox(shape, frame, measure), tolerance)
    case 'rect': {
      const box = shapeBox(shape, frame, measure)
      if (mode === 'inside') return inside(point, box, reach)
      const right = box.left + box.width
      const bottom = box.top + box.height
      const corners = [
        { x: box.left, y: box.top },
        { x: right, y: box.top },
        { x: right, y: bottom },
        { x: box.left, y: bottom }
      ]
      return corners.some((corner, index) => distanceToSegment(point, corner, corners[(index + 1) % 4]) <= reach)
    }
    case 'ellipse': {
      const box = shapeBox(shape, frame, measure)
      const rx = Math.max(box.width / 2, 1)
      const ry = Math.max(box.height / 2, 1)
      const radius = Math.hypot((point.x - (box.left + rx)) / rx, (point.y - (box.top + ry)) / ry)
      if (mode === 'inside') return radius <= 1 + reach / Math.min(rx, ry)
      return Math.abs(radius - 1) * Math.min(rx, ry) <= reach
    }
  }
}

/** Top-most drawing under the pointer: strokes first, then the inside of rectangles and circles. */
export function shapeAt<T extends { shape: Shape }>(
  items: readonly T[],
  point: Point,
  frame: FrameSize,
  measure: TextMeasure,
  tolerance: number
): T | undefined {
  const topFirst = [...items].reverse()
  return (
    topFirst.find((item) => hitsShape(item.shape, point, frame, measure, tolerance, 'edge')) ??
    topFirst.find((item) => hitsShape(item.shape, point, frame, measure, tolerance, 'inside'))
  )
}

/** A grip on the picked shape: the corners and sides of its box, or the two ends of an arrow. */
export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'from' | 'to'

export interface Handle {
  id: HandleId
  /** Where it is drawn, in pixels of the frame. */
  x: number
  y: number
}

/** Corners first: on a tiny shape they win over the sides, which they would otherwise cover. */
const BOX_HANDLES: readonly HandleId[] = ['nw', 'ne', 'se', 'sw', 'n', 'e', 's', 'w']
const CORNERS: readonly HandleId[] = ['nw', 'ne', 'se', 'sw']

interface Edges {
  left: number
  top: number
  right: number
  bottom: number
}

/** Where a grip sits on a box: the corner or side its id names. */
const pointOf = (edges: Edges, id: HandleId): Point => ({
  x: id.includes('w') ? edges.left : id.includes('e') ? edges.right : (edges.left + edges.right) / 2,
  y: id.includes('n') ? edges.top : id.includes('s') ? edges.bottom : (edges.top + edges.bottom) / 2
})

/** Grips of a picked shape, on its dashed outline. A text only resizes from its corners (it keeps its proportions). */
export function handlesOf(shape: Shape, frame: FrameSize, measure: TextMeasure): Handle[] {
  if (shape.kind === 'arrow') {
    const from = toPx(shape.from, frame)
    const to = toPx(shape.to, frame)
    return [
      { id: 'from', x: from.x, y: from.y },
      { id: 'to', x: to.x, y: to.y }
    ]
  }
  const box = shapeBox(shape, frame, measure)
  const outline = {
    left: box.left - OUTLINE_PAD,
    top: box.top - OUTLINE_PAD,
    right: box.left + box.width + OUTLINE_PAD,
    bottom: box.top + box.height + OUTLINE_PAD
  }
  return (shape.kind === 'text' ? CORNERS : BOX_HANDLES).map((id) => ({ id, ...pointOf(outline, id) }))
}

/** The grip under a point (pixels), the first listed one when several are within reach. */
export function handleAt(handles: readonly Handle[], point: Point, reach: number): Handle | undefined {
  return handles.find((handle) => Math.hypot(point.x - handle.x, point.y - handle.y) <= reach)
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

/** Where a value goes when its range 'from' is stretched to 'to'; a range with no length can't stretch. */
function stretch(value: number, from: { min: number; size: number }, to: { min: number; size: number }): number {
  return from.size > 1e-9 ? to.min + ((value - from.min) / from.size) * to.size : value
}

/** A text scaled from the corner opposite to the grip, so that corner stays where it is. */
function resizeText(shape: TextShape, id: HandleId, delta: Point, frame: FrameSize, measure: TextMeasure): TextShape {
  const box = shapeBox(shape, frame, measure)
  const edges = { left: box.left, top: box.top, right: box.left + box.width, bottom: box.top + box.height }
  const held = pointOf(edges, id)
  const anchor = pointOf(edges, id === 'nw' ? 'se' : id === 'ne' ? 'sw' : id === 'se' ? 'nw' : 'ne')
  const reach = { x: held.x - anchor.x, y: held.y - anchor.y }
  const pull = { x: held.x + delta.x * frame.width - anchor.x, y: held.y + delta.y * frame.height - anchor.y }
  const length = reach.x * reach.x + reach.y * reach.y
  // How far along the diagonal the grip went, relative to where it started.
  const factor = length > 0 ? (pull.x * reach.x + pull.y * reach.y) / length : 1
  const width = clamp(shape.style.width * Math.max(factor, 0.05), TEXT_WIDTH_RANGE.min, TEXT_WIDTH_RANGE.max)
  const style = { ...shape.style, width }
  const size = measure({ ...shape, style })
  const left = id === 'nw' || id === 'sw' ? anchor.x - size.width : anchor.x
  const top = id === 'nw' || id === 'ne' ? anchor.y - size.height : anchor.y
  return { ...shape, style, at: { x: left / frame.width, y: top / frame.height } }
}

/**
 * The shape after dragging a grip by `delta` (fractions of the frame, from where the drag began).
 * Always computed from the shape as it was when the drag began, so the result never drifts.
 */
export function resizeShape(shape: Shape, id: HandleId, delta: Point, frame: FrameSize, measure: TextMeasure): Shape {
  if (shape.kind === 'arrow') {
    if (id === 'from') return { ...shape, from: { x: shape.from.x + delta.x, y: shape.from.y + delta.y } }
    if (id === 'to') return { ...shape, to: { x: shape.to.x + delta.x, y: shape.to.y + delta.y } }
    return shape
  }
  if (shape.kind === 'text') return CORNERS.includes(id) ? resizeText(shape, id, delta, frame, measure) : shape

  const points = shape.kind === 'pen' ? shape.points : [shape.from, shape.to]
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const edges = { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) }
  const moved = { ...edges }
  if (id.includes('w')) moved.left += delta.x
  if (id.includes('e')) moved.right += delta.x
  if (id.includes('n')) moved.top += delta.y
  if (id.includes('s')) moved.bottom += delta.y

  if (shape.kind !== 'pen') {
    return { ...shape, from: { x: moved.left, y: moved.top }, to: { x: moved.right, y: moved.bottom } }
  }
  const across = { from: { min: edges.left, size: edges.right - edges.left }, to: { min: moved.left, size: moved.right - moved.left } }
  const down = { from: { min: edges.top, size: edges.bottom - edges.top }, to: { min: moved.top, size: moved.bottom - moved.top } }
  return {
    ...shape,
    points: shape.points.map((point) => ({ x: stretch(point.x, across.from, across.to), y: stretch(point.y, down.from, down.to) }))
  }
}
