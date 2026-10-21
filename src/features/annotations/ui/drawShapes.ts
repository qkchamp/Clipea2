import type { Point, Shape } from '../domain/annotation'
import type { Box, TextShape } from '../domain/shapeGeometry'

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/**
 * Every size is a fraction of the frame height (never a fixed pixel minimum), so the overlay on a
 * small player and the PNG burned at 1080p look exactly the same.
 */
const MIN_LINE = 0.0015
const MIN_ARROW_HEAD = 0.02
const MIN_TEXT = 0.02

/** Font size of text drawings, derived from the stroke width so the size picker affects both. */
export function textSizeFor(width: number, frameHeight: number): number {
  return Math.max(MIN_TEXT, width * 6) * frameHeight
}

const textFont = (size: number): string => `800 ${size}px 'Segoe UI', system-ui, sans-serif`

/** Pixel size of a text drawing on a frame of that height. */
export function measureText(ctx: Context2D, shape: TextShape, frameHeight: number): { width: number; height: number } {
  const size = textSizeFor(shape.style.width, frameHeight)
  ctx.save()
  ctx.font = textFont(size)
  const width = ctx.measureText(shape.text).width
  ctx.restore()
  return { width, height: size * 1.2 }
}

/** Dashed frame around the drawing picked with the cursor; only on screen, never exported. */
export function drawSelection(ctx: Context2D, box: Box): void {
  const pad = 6
  ctx.save()
  ctx.lineWidth = 1.5
  ctx.setLineDash([5, 4])
  ctx.strokeStyle = '#ffffff'
  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)'
  ctx.shadowBlur = 3
  ctx.strokeRect(box.left - pad, box.top - pad, box.width + pad * 2, box.height + pad * 2)
  ctx.restore()
}

/**
 * Draws shapes on a canvas the size of the video frame. The same code paints the live overlay
 * and the PNGs burned into the export, so what you see is what goes to Discord.
 */
export function drawShapes(ctx: Context2D, shapes: readonly Shape[], width: number, height: number): void {
  for (const shape of shapes) drawShape(ctx, shape, width, height)
}

function drawShape(ctx: Context2D, shape: Shape, width: number, height: number): void {
  const lineWidth = Math.max(MIN_LINE, shape.style.width) * height
  const toPx = (point: Point): Point => ({ x: point.x * width, y: point.y * height })

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = lineWidth
  ctx.strokeStyle = shape.style.color
  ctx.fillStyle = shape.style.color
  // Dark halo keeps strokes readable over bright game footage.
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)'
  ctx.shadowBlur = lineWidth * 1.2

  switch (shape.kind) {
    case 'pen': {
      const points = shape.points.map(toPx)
      if (points.length === 0) break
      ctx.beginPath()
      ctx.moveTo(points[0].x, points[0].y)
      if (points.length === 1) ctx.lineTo(points[0].x + 0.01, points[0].y)
      for (let i = 1; i < points.length - 1; i++) {
        const mid = { x: (points[i].x + points[i + 1].x) / 2, y: (points[i].y + points[i + 1].y) / 2 }
        ctx.quadraticCurveTo(points[i].x, points[i].y, mid.x, mid.y)
      }
      if (points.length > 1) ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y)
      ctx.stroke()
      break
    }
    case 'arrow': {
      const from = toPx(shape.from)
      const to = toPx(shape.to)
      const angle = Math.atan2(to.y - from.y, to.x - from.x)
      const head = Math.max(MIN_ARROW_HEAD * height, lineWidth * 4)
      const shaftEnd = { x: to.x - Math.cos(angle) * head * 0.6, y: to.y - Math.sin(angle) * head * 0.6 }
      ctx.beginPath()
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(shaftEnd.x, shaftEnd.y)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(to.x, to.y)
      ctx.lineTo(to.x - head * Math.cos(angle - 0.45), to.y - head * Math.sin(angle - 0.45))
      ctx.lineTo(to.x - head * Math.cos(angle + 0.45), to.y - head * Math.sin(angle + 0.45))
      ctx.closePath()
      ctx.fill()
      break
    }
    case 'rect': {
      const a = toPx(shape.from)
      const b = toPx(shape.to)
      ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y))
      break
    }
    case 'ellipse': {
      const a = toPx(shape.from)
      const b = toPx(shape.to)
      ctx.beginPath()
      ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2)
      ctx.stroke()
      break
    }
    case 'text': {
      const at = toPx(shape.at)
      const size = textSizeFor(shape.style.width, height)
      ctx.font = textFont(size)
      ctx.textBaseline = 'top'
      ctx.shadowBlur = 0
      ctx.lineWidth = size / 5
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)'
      ctx.strokeText(shape.text, at.x, at.y)
      ctx.fillText(shape.text, at.x, at.y)
      break
    }
  }
  ctx.restore()
}
