import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import { clamp } from '@shared/domain/time'
import { translateShape, type Point, type Shape, type StrokeStyle } from '../domain/annotation'
import { isPlain, type Look } from '../domain/effects'
import { handleAt, handlesOf, resizeShape, shapeAt, shapeBox, type FrameSize, type Handle, type HandleId, type TextMeasure } from '../domain/shapeGeometry'
import type { DrawTool } from './annotationStore'
import { drawSelection, drawShapes, drawWithLook, measureText, textSizeFor } from './drawShapes'
import styles from './annotations.module.css'

export interface VideoRect {
  left: number
  top: number
  width: number
  height: number
}

/** A drawing as it is on the frame on screen: where it sits (keyframes applied) and how its effects leave it. */
export interface PlacedDrawing {
  id: string
  shape: Shape
  look: Look
}

interface AnnotationLayerProps {
  rect: VideoRect
  /** Drawings visible on the current frame, in drawing order. */
  items: readonly PlacedDrawing[]
  drawing: boolean
  tool: DrawTool
  color: string
  width: number
  selectedId: string | null
  onShape: (shape: Shape) => void
  onSelect: (id: string | null) => void
  onMove: (id: string, dx: number, dy: number) => void
  /** `shape` is how the drawing looks on screen after being resized. */
  onResize: (id: string, shape: Shape) => void
  onEditText: (id: string, text: string) => void
}

/** Pixels around a stroke that still grab it with the cursor. */
const GRAB_PX = 6
/** Pixels around a grip that still grab it. */
const HANDLE_REACH_PX = 9

const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y)

type Resize = { id: string; handle: HandleId; origin: Point; original: Shape; current: Shape; delta: Point }

/**
 * Canvas exactly over the visible video frame: paints drawings and, in draw mode, captures new
 * ones. With the cursor tool it picks drawings to drag them, grips on the picked one resize it,
 * and a double click edits a text.
 */
export function AnnotationLayer({
  rect,
  items,
  drawing,
  tool,
  color,
  width,
  selectedId,
  onShape,
  onSelect,
  onMove,
  onResize,
  onEditText
}: AnnotationLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Where a drawing is painted whole before it is faded (see drawWithLook).
  const scratchRef = useRef<HTMLCanvasElement | null>(null)
  const [draft, setDraft] = useState<Shape | null>(null)
  const [drag, setDrag] = useState<{ id: string; origin: Point; dx: number; dy: number } | null>(null)
  const [resize, setResize] = useState<Resize | null>(null)
  const [overShape, setOverShape] = useState(false)
  const [overHandle, setOverHandle] = useState<HandleId | null>(null)
  // Each text box gets its own id: a late blur from an old box must never commit or close a new one.
  const [textBox, setTextBox] = useState<{ id: number; at: Point; style: StrokeStyle; editId?: string } | null>(null)
  const [text, setText] = useState('')
  const textBoxIds = useRef(0)
  const openBox = useRef<{ id: number; at: Point; text: string; editId?: string } | null>(null)
  const picking = drawing && tool === 'select'

  const measure: TextMeasure = (shape) => {
    const context = canvasRef.current?.getContext('2d')
    return context ? measureText(context, shape, rect.height) : { width: 0, height: 0 }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const ratio = window.devicePixelRatio || 1
    const pixelWidth = Math.max(1, Math.round(rect.width * ratio))
    const pixelHeight = Math.max(1, Math.round(rect.height * ratio))
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.clearRect(0, 0, pixelWidth, pixelHeight)
    context.scale(ratio, ratio)

    const frame: FrameSize = { width: rect.width, height: rect.height }
    const measureHere: TextMeasure = (shape) => measureText(context, shape, rect.height)
    const scratch = () => {
      const layer = (scratchRef.current ??= document.createElement('canvas'))
      if (layer.width !== pixelWidth) layer.width = pixelWidth
      if (layer.height !== pixelHeight) layer.height = pixelHeight
      const layerContext = layer.getContext('2d')
      if (!layerContext) return null
      layerContext.setTransform(1, 0, 0, 1, 0, 0)
      layerContext.scale(ratio, ratio)
      return { canvas: layer, context: layerContext }
    }

    const placed = items
      // The text being edited is the input box for now.
      .filter((item) => item.id !== textBox?.editId)
      .map((item) => {
        const shape = resize?.id === item.id ? resize.current : drag?.id === item.id ? translateShape(item.shape, drag.dx, drag.dy) : item.shape
        return { ...item, shape }
      })
    for (const item of placed) {
      // Effects scale a drawing around the middle of its shape.
      const box = isPlain(item.look) ? null : shapeBox(item.shape, frame, measureHere)
      const center = box ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : { x: 0, y: 0 }
      drawWithLook(context, item.shape, item.look, center, rect.width, rect.height, scratch)
    }
    if (draft) drawShapes(context, [draft], rect.width, rect.height)

    const selected = picking ? placed.find((item) => item.id === selectedId) : undefined
    if (selected) {
      drawSelection(context, shapeBox(selected.shape, frame, measureHere), handlesOf(selected.shape, frame, measureHere))
    }
  }, [rect.width, rect.height, items, draft, drag, resize, picking, selectedId, textBox?.editId])

  useEffect(() => {
    if (!drawing) {
      setDraft(null)
      setDrag(null)
      setResize(null)
      openBox.current = null
      setTextBox(null)
      setText('')
    }
  }, [drawing])

  const pointFrom = (event: PointerEvent<HTMLCanvasElement>): Point => {
    const box = event.currentTarget.getBoundingClientRect()
    return { x: clamp((event.clientX - box.left) / box.width, 0, 1), y: clamp((event.clientY - box.top) / box.height, 0, 1) }
  }

  const toPixels = (point: Point): Point => ({ x: point.x * rect.width, y: point.y * rect.height })

  const drawingAt = (point: Point): PlacedDrawing | undefined => shapeAt(items, toPixels(point), rect, measure, GRAB_PX)

  /** The grip of the picked drawing under the pointer, if any. */
  const gripAt = (point: Point): { item: PlacedDrawing; handle: Handle } | undefined => {
    const item = items.find((candidate) => candidate.id === selectedId)
    if (!item) return undefined
    const handle = handleAt(handlesOf(item.shape, rect, measure), toPixels(point), HANDLE_REACH_PX)
    return handle ? { item, handle } : undefined
  }

  /** Commits the open text box (if `id` matches it) exactly once. */
  const commitText = (id: number): void => {
    const box = openBox.current
    if (!box || box.id !== id) return
    openBox.current = null
    const value = box.text.trim()
    if (box.editId) onEditText(box.editId, value)
    else if (value !== '') onShape({ kind: 'text', at: box.at, text: value, style: { color, width } })
    setTextBox(null)
    setText('')
  }

  const discardText = (): void => {
    openBox.current = null
    setTextBox(null)
    setText('')
  }

  const openTextBox = (at: Point, style: StrokeStyle, initial = '', editId?: string): void => {
    if (openBox.current) commitText(openBox.current.id)
    const id = ++textBoxIds.current
    openBox.current = { id, at, text: initial, editId }
    setTextBox({ id, at, style, editId })
    setText(initial)
  }

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>): void => {
    if (!drawing || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const point = pointFrom(event)
    if (tool === 'select') {
      if (openBox.current) commitText(openBox.current.id)
      const grip = gripAt(point)
      if (grip) {
        event.currentTarget.setPointerCapture(event.pointerId)
        setResize({ id: grip.item.id, handle: grip.handle.id, origin: point, original: grip.item.shape, current: grip.item.shape, delta: { x: 0, y: 0 } })
        return
      }
      const hit = drawingAt(point)
      onSelect(hit?.id ?? null)
      if (!hit) return
      event.currentTarget.setPointerCapture(event.pointerId)
      setDrag({ id: hit.id, origin: point, dx: 0, dy: 0 })
      return
    }
    if (tool === 'text') return openTextBox(point, { color, width })
    event.currentTarget.setPointerCapture(event.pointerId)
    const style = { color, width }
    setDraft(tool === 'pen' ? { kind: 'pen', points: [point], style } : { kind: tool, from: point, to: point, style })
  }

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>): void => {
    const point = pointFrom(event)
    if (resize) {
      const delta = { x: point.x - resize.origin.x, y: point.y - resize.origin.y }
      return setResize({ ...resize, delta, current: resizeShape(resize.original, resize.handle, delta, rect, measure) })
    }
    if (picking && !drag) {
      const grip = gripAt(point)
      const handle = grip?.handle.id ?? null
      if (handle !== overHandle) setOverHandle(handle)
      const over = !grip && drawingAt(point) !== undefined
      if (over !== overShape) setOverShape(over)
      return
    }
    if (drag) return setDrag({ ...drag, dx: point.x - drag.origin.x, dy: point.y - drag.origin.y })
    if (!draft) return
    setDraft((current) => {
      if (!current) return current
      if (current.kind === 'pen') return { ...current, points: [...current.points, point] }
      if (current.kind === 'text') return current
      return { ...current, to: point }
    })
  }

  const onPointerUp = (): void => {
    if (resize) {
      if (Math.hypot(resize.delta.x, resize.delta.y) > 0.001) onResize(resize.id, resize.current)
      setResize(null)
      return
    }
    if (drag) {
      if (Math.hypot(drag.dx, drag.dy) > 0.001) onMove(drag.id, drag.dx, drag.dy)
      setDrag(null)
      return
    }
    if (!draft) return
    const meaningful =
      draft.kind === 'pen' ? draft.points.length > 1 : draft.kind !== 'text' && distance(draft.from, draft.to) > 0.008
    if (meaningful) onShape(draft)
    setDraft(null)
  }

  const onDoubleClick = (event: MouseEvent<HTMLCanvasElement>): void => {
    if (!picking) return
    const box = event.currentTarget.getBoundingClientRect()
    const hit = drawingAt({ x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height })
    if (hit?.shape.kind === 'text') openTextBox(hit.shape.at, hit.shape.style, hit.shape.text, hit.id)
  }

  const boxStyle = textBox?.style ?? { color, width }
  const handle = picking ? (resize?.handle ?? overHandle ?? undefined) : undefined

  return (
    <div
      className={styles.layer}
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
      data-drawing={drawing || undefined}
    >
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        data-tool={tool}
        data-over={(picking && !handle && (overShape || drag !== null)) || undefined}
        data-handle={handle}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          setDraft(null)
          setDrag(null)
          setResize(null)
        }}
        onDoubleClick={onDoubleClick}
        // Keeps the focus in the open text box: clicking the canvas must not blur (and close) it.
        onMouseDown={(event) => drawing && event.preventDefault()}
        onClick={(event) => drawing && event.stopPropagation()}
      />
      {textBox ? (
        <input
          key={textBox.id}
          autoFocus
          className={styles.textInput}
          style={{
            left: textBox.at.x * rect.width,
            top: textBox.at.y * rect.height,
            color: boxStyle.color,
            fontSize: textSizeFor(boxStyle.width, rect.height)
          }}
          value={text}
          aria-label="Texto del dibujo"
          placeholder="Escribí y Enter"
          onChange={(event) => {
            setText(event.target.value)
            if (openBox.current?.id === textBox.id) openBox.current.text = event.target.value
          }}
          onBlur={() => commitText(textBox.id)}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === 'Enter') commitText(textBox.id)
            if (event.key === 'Escape') discardText()
          }}
        />
      ) : null}
    </div>
  )
}
