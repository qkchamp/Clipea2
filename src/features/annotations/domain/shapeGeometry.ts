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
