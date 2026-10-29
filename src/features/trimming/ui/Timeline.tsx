import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
  type RefObject
} from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { clamp, formatTime } from '@shared/domain/time'
import { ContextMenu } from '@shared/ui/organisms/ContextMenu'
import type { EffectKind } from '@features/annotations/domain/effects'
import { MIN_RANGE_SECONDS, rangeDuration, shiftRange, type TimeRange } from '../domain/timeRange'
import styles from './trimming.module.css'

/** Stretch of a drawing's bar that one of its effects covers (seconds of the video). */
export interface TimelineEffect {
  kind: EffectKind
  label: string
  from: number
  to: number
}

/** A drawing on its bar under the filmstrip: drag the sides to change when it shows up and until when. */
export interface TimelineDrawing {
  id: string
  start: number
  end: number
  label: string
  color: string
  lane: number
  /** Times of its animation keyframes, drawn as diamonds on the bar. */
  keyframes: readonly number[]
  /** Fades, zooms… painted on the bar where they act. */
  effects: readonly TimelineEffect[]
}

export type DrawingEdit = 'start' | 'end' | 'move'

export interface TimelineBand {
  id: string
  start: number
  end: number
  number: number
}

interface TimelineProps {
  duration: number
  range: TimeRange | null
  frames: readonly string[]
  bands: readonly TimelineBand[]
  drawings: readonly TimelineDrawing[]
  /** Shows the rows of drawing bars (while drawing, or once the video has drawings). */
  showDrawings: boolean
  selectedDrawingId: string | null
  disabled?: boolean
  /** Ajustes › Timeline anterior: in and out as orange tabs instead of the green and red lines. */
  classic?: boolean
  onSeek: (time: number) => void
  /** Wheel over the ruler or the track: one frame forward (+1, up) or back (-1, down). */
  onStepFrame: (delta: number) => void
  onRangeChange: (range: TimeRange) => void
  /** Clicked on its bar; `time` when the click landed on a keyframe. */
  onDrawingSelect: (id: string, time?: number) => void
  /** Raw times under the pointer; the caller snaps them to frames. */
  onDrawingChange: (id: string, start: number, end: number, edit: DrawingEdit) => void
  onDrawingDragEnd: () => void
  /** Right click on its bar → "Editar": open it with the cursor in drawing mode. */
  onDrawingEdit: (id: string) => void
  /** Right click on its bar → "Borrar". */
  onDrawingDelete: (id: string) => void
  /**
   * Draws the playhead. It changes on every frame, so it renders on its own instead of
   * re-rendering the whole timeline; `toPercent` places a time on the zoomed track.
   */
  renderPlayhead: (toPercent: (time: number) => number) => ReactNode
}

type Drag = { mode: 'scrub' } | { mode: 'in' } | { mode: 'out' } | { mode: 'move'; origin: number; initial: TimeRange }
type DrawingDrag = { id: string; edit: DrawingEdit; origin: number; initial: TimeRange }

const TICK_STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600]
const MIN_TICK_PX = 76
/** Handles sit outside the selection so short ones stay grabbable, unless the track edge would clip them. */
const HANDLE_PX = 12
const LANE_PX = 18
/** Space under each bar (16 tall in the CSS); the rows' box ends at the last bar, not after its gap. */
const LANE_GAP_PX = 2
/** Same as the bars' min-width in the CSS. */
const MIN_BAR_PX = 6
/** Rows of drawing bars on screen; more scroll. Fixed, so a new row never shrinks the video while drawing. */
const VISIBLE_LANES = 3

const sliderValue = (time: number): number => Math.round(time * 100) / 100

/** Where each playhead canvas was last drawn, to draw it again when the track changes size. */
const drawnAt = new WeakMap<HTMLCanvasElement, number>()

/**
 * The playhead's look: a 2px white line with a dark glow, and a 10px knob on top, flat above and
 * round below, whose top pixel hides behind the track's edge. In whole device pixels, like the
 * page snaps a box, so the line stays sharp.
 */
function drawPlayhead(canvas: HTMLCanvasElement, percent: number): void {
  drawnAt.set(canvas, percent)
  const context = canvas.getContext('2d')
  if (!context) return
  const ratio = window.devicePixelRatio || 1
  const x = (percent / 100) * canvas.width
  const knobLeft = Math.round(x - 5 * ratio)
  const knobWidth = Math.round(10 * ratio)
  const radius = knobWidth / 2
  const knobBottom = Math.round(-ratio) + Math.round(10 * ratio)
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#fff'
  context.shadowColor = 'rgba(0, 0, 0, 0.9)'
  context.shadowBlur = 4 * ratio
  context.fillRect(Math.round(x - ratio), 0, Math.round(2 * ratio), canvas.height)
  context.shadowColor = 'transparent'
  context.beginPath()
  context.moveTo(knobLeft, 0)
  context.lineTo(knobLeft + knobWidth, 0)
  context.arc(knobLeft + radius, knobBottom - radius, radius, 0, Math.PI)
  context.closePath()
  context.fill()
}

/**
 * Scrubbable timeline with in/out handles. Ctrl+wheel zooms around the pointer, wheel pans
 * while zoomed, double click resets the zoom.
 */
/**
 * Playhead; the keyboard drives it with the player shortcuts (←/→, Ctrl+←/→, Inicio/Fin). It is
 * painted on a canvas over the track: a line moving in the page made the browser rebuild the
 * layers of the whole window on every frame, while a canvas only swaps its own pixels.
 */
export function TimelinePlayhead({
  ref,
  time,
  duration,
  toPercent
}: {
  ref?: Ref<HTMLDivElement>
  time: number
  duration: number
  toPercent: (time: number) => number
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const percent = toPercent(time)

  // As many pixels as the screen has under the track, drawn again whenever that changes.
  useLayoutEffect(() => {
    const element = canvas.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      const box = entry.devicePixelContentBoxSize?.[0]
      element.width = box?.inlineSize ?? Math.round(entry.contentRect.width * (window.devicePixelRatio || 1))
      element.height = box?.blockSize ?? Math.round(entry.contentRect.height * (window.devicePixelRatio || 1))
      drawPlayhead(element, drawnAt.get(element) ?? 0)
    })
    observer.observe(element, { box: 'device-pixel-content-box' })
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    if (canvas.current) drawPlayhead(canvas.current, percent)
  }, [percent])

  return (
    <div
      ref={ref}
      className={styles.playhead}
      role="slider"
      tabIndex={0}
      aria-label="Posición en el video"
      aria-valuemin={0}
      aria-valuemax={sliderValue(duration)}
      aria-valuenow={sliderValue(time)}
      aria-valuetext={formatTime(time)}
    >
      <canvas ref={canvas} className={styles.playheadCanvas} />
    </div>
  )
}

/** Moves a TimelinePlayhead without rendering it, for the one that follows every frame. */
export function placePlayhead(playhead: HTMLDivElement, percent: number, time: number): void {
  const canvas = playhead.firstElementChild
  if (canvas instanceof HTMLCanvasElement) drawPlayhead(canvas, percent)
  playhead.setAttribute('aria-valuenow', String(sliderValue(time)))
  playhead.setAttribute('aria-valuetext', formatTime(time))
}

/*
 * The parts below change only with zoom, size or their own data: dragging the selection or a
 * handle re-renders the timeline on every move, and they skip it.
 */

/** Times along the top. A click on a time goes there; between times it does nothing. */
const Ruler = memo(function Ruler({
  duration,
  from,
  to,
  width,
  zoomed,
  disabled,
  onSeek
}: {
  duration: number
  from: number
  to: number
  width: number
  zoomed: boolean
  disabled: boolean
  onSeek: (time: number) => void
}) {
  const span = Math.max(to - from, 0.001)
  const step = TICK_STEPS.find((candidate) => candidate * (width / span) >= MIN_TICK_PX) ?? 7200
  const ticks: number[] = []
  if (duration > 0) {
    for (let tick = Math.ceil(from / step) * step; tick <= to + 1e-9; tick += step) ticks.push(tick)
  }
  return (
    <div className={styles.ruler} aria-hidden>
      {ticks.map((tick) => (
        <span
          key={tick}
          className={styles.tick}
          style={{ left: `${((tick - from) / span) * 100}%` }}
          onClick={() => !disabled && onSeek(tick)}
        >
          {formatTime(tick, step < 1 ? 1 : 0)}
        </span>
      ))}
      {zoomed ? <span className={styles.zoomHint}>Zoom · doble clic para ver todo</span> : null}
    </div>
  )
})

const Filmstrip = memo(function Filmstrip({ frames, duration, from, to }: { frames: readonly string[]; duration: number; from: number; to: number }) {
  const span = Math.max(to - from, 0.001)
  const frameSpan = frames.length > 0 ? duration / frames.length : 0
  return (
    <div className={styles.filmstrip}>
      {frames.map((url, index) => {
        const start = index * frameSpan
        if (start + frameSpan < from || start > to) return null
        return (
          <img
            key={url}
            src={url}
            alt=""
            draggable={false}
            decoding="async"
            className={styles.frame}
            style={{ left: `${((start - from) / span) * 100}%`, width: `${(frameSpan / span) * 100}%` }}
          />
        )
      })}
    </div>
  )
})

/** What the bars do with the pointer; a ref, so the rows keep their props while the handlers change. */
interface DrawingBarHandlers {
  pointerDown: (event: PointerEvent<HTMLDivElement>, drawing: TimelineDrawing) => void
  pointerMove: (event: PointerEvent<HTMLDivElement>) => void
  pointerEnd: () => void
  contextMenu: (event: MouseEvent<HTMLDivElement>, drawing: TimelineDrawing) => void
}

const DrawingRows = memo(function DrawingRows({
  drawings,
  from,
  to,
  selectedId,
  menuId,
  handlers
}: {
  drawings: readonly TimelineDrawing[]
  from: number
  to: number
  selectedId: string | null
  menuId: string | null
  handlers: RefObject<DrawingBarHandlers>
}) {
  const span = Math.max(to - from, 0.001)
  const lanes = drawings.reduce((count, drawing) => Math.max(count, drawing.lane + 1), 0)
  return (
    <div className={styles.drawingRows} style={{ height: Math.max(0, lanes * LANE_PX - LANE_GAP_PX) }}>
      {drawings.map((drawing) => {
        if (drawing.end < from || drawing.start > to) return null
        return (
          <div
            key={drawing.id}
            className={styles.drawingBar}
            data-selected={drawing.id === selectedId || undefined}
            style={{
              // A bar of a frame or two keeps its minimum width inside the track instead of poking past the end.
              left: `min(${((drawing.start - from) / span) * 100}%, calc(100% - ${MIN_BAR_PX}px))`,
              width: `${((drawing.end - drawing.start) / span) * 100}%`,
              top: drawing.lane * LANE_PX,
              ['--drawing-color' as string]: drawing.color
            }}
            title={`${drawing.label} · ${formatTime(drawing.start)} → ${formatTime(drawing.end)}${
              drawing.effects.length > 0 ? ` · ${drawing.effects.map((effect) => effect.label).join(', ')}` : ''
            }`}
            data-menu={menuId === drawing.id || undefined}
            onPointerDown={(event) => handlers.current.pointerDown(event, drawing)}
            onContextMenu={(event) => handlers.current.contextMenu(event, drawing)}
            onPointerMove={(event) => handlers.current.pointerMove(event)}
            onPointerUp={() => handlers.current.pointerEnd()}
            onPointerCancel={() => handlers.current.pointerEnd()}
          >
            <span className={styles.drawingEdge} data-role="start" data-side="start" />
            {drawing.effects.map((effect) => {
              const length = Math.max(drawing.end - drawing.start, 1e-6)
              return (
                <span
                  key={effect.kind}
                  className={styles.effectSpan}
                  data-kind={effect.kind}
                  style={{
                    left: `${((effect.from - drawing.start) / length) * 100}%`,
                    width: `${((effect.to - effect.from) / length) * 100}%`
                  }}
                />
              )
            })}
            <span className={styles.drawingLabel}>{drawing.label}</span>
            {drawing.keyframes.map((time) => (
              <span
                key={time}
                className={styles.keyframe}
                data-role="keyframe"
                data-time={time}
                style={{ left: `${((time - drawing.start) / Math.max(drawing.end - drawing.start, 1e-6)) * 100}%` }}
                title={`Keyframe en ${formatTime(time)}`}
              />
            ))}
            <span className={styles.drawingEdge} data-role="end" data-side="end" />
          </div>
        )
      })}
    </div>
  )
})

export function Timeline({
  duration,
  range,
  frames,
  bands,
  drawings,
  showDrawings,
  selectedDrawingId,
  disabled = false,
  classic = false,
  onSeek,
  onStepFrame,
  onRangeChange,
  onDrawingSelect,
  onDrawingChange,
  onDrawingDragEnd,
  onDrawingEdit,
  onDrawingDelete,
  renderPlayhead
}: TimelineProps) {
  const timelineRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const drawingsRef = useRef<HTMLDivElement>(null)
  // Read when the wheel fires, so a new function on every render doesn't re-subscribe the listener.
  const stepFrame = useRef(onStepFrame)
  stepFrame.current = onStepFrame
  // The ruler is memoized: it gets one function for good, which calls the latest onSeek.
  const latestSeek = useRef(onSeek)
  latestSeek.current = onSeek
  const [seekTick] = useState(() => (time: number) => latestSeek.current(time))
  const dragRef = useRef<Drag | null>(null)
  const drawingDragRef = useRef<DrawingDrag | null>(null)
  // The track's box, read once when a drag starts: reading it on every move would make the browser
  // lay out the page again right after each move changed it.
  const dragBox = useRef<DOMRect | null>(null)
  const [width, setWidth] = useState(800)
  const [view, setView] = useState<{ from: number; to: number } | null>(null)
  // Right click menu of a drawing bar: which drawing, and where the pointer was.
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const menuDrawing = menu ? drawings.find((drawing) => drawing.id === menu.id) : undefined

  useEffect(() => setView(null), [duration])

  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    const observer = new ResizeObserver(() => setWidth(track.clientWidth || 800))
    observer.observe(track)
    return () => observer.disconnect()
  }, [])

  const from = view?.from ?? 0
  const to = view?.to ?? duration
  const span = Math.max(to - from, 0.001)
  // Stable while the zoom stays: the playhead re-subscribes to the player only when it changes.
  const pct = useCallback((time: number): number => ((time - from) / span) * 100, [from, span])

  // Native listener: React's wheel handler is passive and cannot stop the page from scrolling.
  // Ctrl zooms and Shift (or a sideways wheel) pans, also over the drawing bars, so zooming in to
  // place one frame by frame works from there. The plain wheel steps frames over the ruler and the
  // track, like on the play button; over the bars it scrolls their rows.
  useEffect(() => {
    const track = trackRef.current
    const timeline = timelineRef.current
    if (!track || !timeline || duration <= 0) return
    const onWheel = (event: WheelEvent): void => {
      const box = track.getBoundingClientRect()
      const anchor = from + ((event.clientX - box.left) / box.width) * span
      if (event.ctrlKey) {
        event.preventDefault()
        const nextSpan = clamp(span * (event.deltaY > 0 ? 1.25 : 0.8), Math.min(1, duration), duration)
        if (nextSpan >= duration - 1e-6) return setView(null)
        const nextFrom = clamp(anchor - ((anchor - from) * nextSpan) / span, 0, duration - nextSpan)
        setView({ from: nextFrom, to: nextFrom + nextSpan })
      } else if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        if (!view) return
        event.preventDefault()
        const delta = ((event.deltaX || event.deltaY) / box.width) * span
        const nextFrom = clamp(from + delta, 0, duration - span)
        setView({ from: nextFrom, to: nextFrom + span })
      } else if (!disabled && event.deltaY !== 0 && !(event.target instanceof Node && drawingsRef.current?.contains(event.target))) {
        event.preventDefault()
        stepFrame.current(event.deltaY < 0 ? 1 : -1)
      }
    }
    timeline.addEventListener('wheel', onWheel, { passive: false })
    return () => timeline.removeEventListener('wheel', onWheel)
  }, [duration, from, span, view, disabled])

  const timeAt = (clientX: number): number => {
    const box = dragBox.current ?? trackRef.current?.getBoundingClientRect()
    if (!box) return 0
    return clamp(from + ((clientX - box.left) / box.width) * span, 0, duration)
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (disabled || duration <= 0 || event.button !== 0) return
    const role = (event.target as HTMLElement).dataset.role
    dragBox.current = trackRef.current?.getBoundingClientRect() ?? null
    const time = timeAt(event.clientX)
    event.currentTarget.setPointerCapture(event.pointerId)
    if ((role === 'in' || role === 'out') && range) dragRef.current = { mode: role }
    else if (role === 'grip' && range) dragRef.current = { mode: 'move', origin: time, initial: range }
    else {
      dragRef.current = { mode: 'scrub' }
      onSeek(time)
    }
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (!drag) return
    const time = timeAt(event.clientX)
    if (drag.mode === 'scrub') onSeek(time)
    else if (drag.mode === 'move') onRangeChange(shiftRange(drag.initial, time - drag.origin, duration))
    else if (range && drag.mode === 'in') {
      const start = Math.min(time, range.end - MIN_RANGE_SECONDS)
      onRangeChange({ start, end: range.end })
      onSeek(start)
    } else if (range && drag.mode === 'out') {
      const end = Math.max(time, range.start + MIN_RANGE_SECONDS)
      onRangeChange({ start: range.start, end })
      onSeek(end)
    }
  }

  const endDrag = (): void => {
    dragRef.current = null
    dragBox.current = null
  }

  const onDrawingPointerDown = (event: PointerEvent<HTMLDivElement>, drawing: TimelineDrawing): void => {
    if (disabled || event.button !== 0) return
    event.stopPropagation()
    const { role, time } = (event.target as HTMLElement).dataset
    if (role === 'keyframe') return onDrawingSelect(drawing.id, Number(time))
    const edit: DrawingEdit = role === 'start' || role === 'end' ? role : 'move'
    event.currentTarget.setPointerCapture(event.pointerId)
    dragBox.current = trackRef.current?.getBoundingClientRect() ?? null
    drawingDragRef.current = { id: drawing.id, edit, origin: timeAt(event.clientX), initial: { start: drawing.start, end: drawing.end } }
    onDrawingSelect(drawing.id)
  }

  const onDrawingPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const drag = drawingDragRef.current
    if (!drag) return
    const time = timeAt(event.clientX)
    const { start, end } = drag.initial
    if (drag.edit === 'start') onDrawingChange(drag.id, time, end, 'start')
    else if (drag.edit === 'end') onDrawingChange(drag.id, start, time, 'end')
    else {
      const from = clamp(start + time - drag.origin, 0, Math.max(0, duration - (end - start)))
      onDrawingChange(drag.id, from, from + end - start, 'move')
    }
  }

  const endDrawingDrag = (): void => {
    if (!drawingDragRef.current) return
    drawingDragRef.current = null
    dragBox.current = null
    onDrawingDragEnd()
  }

  const drawingHandlers = useRef<DrawingBarHandlers>(null!)
  drawingHandlers.current = {
    pointerDown: onDrawingPointerDown,
    pointerMove: onDrawingPointerMove,
    pointerEnd: endDrawingDrag,
    contextMenu: (event, drawing) => {
      event.preventDefault()
      event.stopPropagation()
      if (!disabled) setMenu({ id: drawing.id, x: event.clientX, y: event.clientY })
    }
  }

  return (
    <div ref={timelineRef} className={styles.timeline} data-disabled={disabled || undefined} data-classic={classic || undefined}>
      <Ruler duration={duration} from={from} to={to} width={width} zoomed={view !== null} disabled={disabled} onSeek={seekTick} />

      <div
        ref={trackRef}
        className={styles.track}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => setView(null)}
      >
        <Filmstrip frames={frames} duration={duration} from={from} to={to} />

        {bands.map((band) => (
          <div
            key={band.id}
            className={styles.band}
            style={{ left: `${pct(band.start)}%`, width: `${((band.end - band.start) / span) * 100}%` }}
            title={`Corte #${band.number} del montaje`}
          >
            <span>{band.number}</span>
          </div>
        ))}

        {range && duration > 0 ? (
          <>
            <div className={styles.dim} style={{ left: 0, width: `${Math.max(0, pct(range.start))}%` }} />
            <div className={styles.dim} style={{ left: `${pct(range.end)}%`, right: 0 }} />
            <div
              className={styles.selection}
              style={{ left: `${pct(range.start)}%`, width: `${((range.end - range.start) / span) * 100}%` }}
            >
              <div className={styles.grip} data-role="grip" title="Arrastrá para mover la selección">
                {formatTime(rangeDuration(range), 1)}
              </div>
              <div
                className={styles.handle}
                data-role="in"
                data-side="in"
                data-inside={(pct(range.start) / 100) * width < HANDLE_PX || undefined}
                title="Inicio (I)"
              />
              <div
                className={styles.handle}
                data-role="out"
                data-side="out"
                data-inside={width - (pct(range.end) / 100) * width < HANDLE_PX || undefined}
                title="Fin (O)"
              />
            </div>
          </>
        ) : null}

        {duration > 0 ? renderPlayhead(pct) : null}
      </div>

      {showDrawings && duration > 0 ? (
        <div
          ref={drawingsRef}
          className={styles.drawings}
          style={{ height: VISIBLE_LANES * LANE_PX - LANE_GAP_PX }}
          aria-label="Dibujos en la línea de tiempo"
        >
          <DrawingRows
            drawings={drawings}
            from={from}
            to={to}
            selectedId={selectedDrawingId}
            menuId={menu?.id ?? null}
            handlers={drawingHandlers}
          />
        </div>
      ) : null}

      {menu && menuDrawing ? (
        <ContextMenu
          at={menu}
          label={`Dibujo: ${menuDrawing.label}`}
          items={[
            { label: 'Editar', icon: <Pencil size={14} />, onSelect: () => onDrawingEdit(menu.id) },
            { label: 'Borrar', icon: <Trash2 size={14} />, danger: true, onSelect: () => onDrawingDelete(menu.id) }
          ]}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </div>
  )
}
