import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { clamp } from '@shared/domain/time'
import type { Point, Shape, ShapeKind } from '../domain/annotation'
import { drawShapes, textSizeFor } from './drawShapes'
import styles from './annotations.module.css'

export interface VideoRect {
  left: number
  top: number
  width: number
  height: number
}

interface AnnotationLayerProps {
  rect: VideoRect
  /** Drawings visible on the current frame. */
  shapes: readonly Shape[]
  drawing: boolean
  tool: ShapeKind
  color: string
  width: number
  onShape: (shape: Shape) => void
}

const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y)

/** Canvas exactly over the visible video frame: paints drawings and, in draw mode, captures new ones. */
export function AnnotationLayer({ rect, shapes, drawing, tool, color, width, onShape }: AnnotationLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [draft, setDraft] = useState<Shape | null>(null)
  // Each text box gets its own id: a late blur from an old box must never commit or close a new one.
  const [textBox, setTextBox] = useState<{ id: number; at: Point } | null>(null)
  const [text, setText] = useState('')
  const textBoxIds = useRef(0)
  const openBox = useRef<{ id: number; at: Point; text: string } | null>(null)

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
    drawShapes(context, draft ? [...shapes, draft] : shapes, rect.width, rect.height)
  }, [rect.width, rect.height, shapes, draft])

  useEffect(() => {
    if (!drawing) {
      setDraft(null)
      openBox.current = null
      setTextBox(null)
      setText('')
    }
  }, [drawing])

  const pointFrom = (event: PointerEvent<HTMLCanvasElement>): Point => {
    const box = event.currentTarget.getBoundingClientRect()
    return { x: clamp((event.clientX - box.left) / box.width, 0, 1), y: clamp((event.clientY - box.top) / box.height, 0, 1) }
  }

  /** Commits the open text box (if `id` matches it) exactly once. */
  const commitText = (id: number): void => {
    const box = openBox.current
    if (!box || box.id !== id) return
    openBox.current = null
    if (box.text.trim() !== '') onShape({ kind: 'text', at: box.at, text: box.text.trim(), style: { color, width } })
    setTextBox(null)
    setText('')
  }

  const discardText = (): void => {
    openBox.current = null
    setTextBox(null)
    setText('')
  }

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>): void => {
    if (!drawing || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const point = pointFrom(event)
    if (tool === 'text') {
      if (openBox.current) commitText(openBox.current.id)
      const id = ++textBoxIds.current
      openBox.current = { id, at: point, text: '' }
      setTextBox({ id, at: point })
      setText('')
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    const style = { color, width }
    setDraft(tool === 'pen' ? { kind: 'pen', points: [point], style } : { kind: tool, from: point, to: point, style })
  }

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>): void => {
    if (!draft) return
    const point = pointFrom(event)
    setDraft((current) => {
      if (!current) return current
      if (current.kind === 'pen') return { ...current, points: [...current.points, point] }
      if (current.kind === 'text') return current
      return { ...current, to: point }
    })
  }

  const onPointerUp = (): void => {
    if (!draft) return
    const meaningful =
      draft.kind === 'pen' ? draft.points.length > 1 : draft.kind !== 'text' && distance(draft.from, draft.to) > 0.008
    if (meaningful) onShape(draft)
    setDraft(null)
  }

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
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDraft(null)}
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
            color,
            fontSize: textSizeFor(width, rect.height)
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
