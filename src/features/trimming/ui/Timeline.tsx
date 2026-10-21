import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { clamp, formatTime } from '@shared/domain/time'
import { MIN_RANGE_SECONDS, rangeDuration, shiftRange, type TimeRange } from '../domain/timeRange'
import styles from './trimming.module.css'

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
  onSeek: (time: number) => void
  onRangeChange: (range: TimeRange) => void
  /** Clicked on its bar; `time` when the click landed on a keyframe. */
  onDrawingSelect: (id: string, time?: number) => void
  /** Raw times under the pointer; the caller snaps them to frames. */
  onDrawingChange: (id: string, start: number, end: number, edit: DrawingEdit) => void
  onDrawingDragEnd: () => void
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
/** Rows of drawing bars on screen; more scroll. Fixed, so a new row never shrinks the video while drawing. */
const VISIBLE_LANES = 3

/**
 * Scrubbable timeline with in/out handles. Ctrl+wheel zooms around the pointer, wheel pans
 * while zoomed, double click resets the zoom.
 */
/** Playhead line; the keyboard drives it with the player shortcuts (←/→, Ctrl+←/→, Inicio/Fin). */
export function TimelinePlayhead({ time, duration, toPercent }: { time: number; duration: number; toPercent: (time: number) => number }) {
  return (
    <div
      className={styles.playhead}
      style={{ left: `${toPercent(time)}%` }}
      role="slider"
      tabIndex={0}
      aria-label="Posición en el video"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration * 100) / 100}
      aria-valuenow={Math.round(time * 100) / 100}
      aria-valuetext={formatTime(time)}
    >
      <span className={styles.playheadKnob} />
    </div>
  )
}

export function Timeline({
  duration,
  range,
  frames,
  bands,
  drawings,
  showDrawings,
  selectedDrawingId,
  disabled = false,
  onSeek,
  onRangeChange,
  onDrawingSelect,
  onDrawingChange,
  onDrawingDragEnd,
  renderPlayhead
}: TimelineProps) {
  const timelineRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const drawingDragRef = useRef<DrawingDrag | null>(null)
  const [width, setWidth] = useState(800)
  const [view, setView] = useState<{ from: number; to: number } | null>(null)

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
  const pct = (time: number): number => ((time - from) / span) * 100

  // Native listener: React's wheel handler is passive and cannot stop the page from scrolling.
  // It covers the drawing bars too, so zooming in to place one frame by frame works from there.
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
      } else if (view) {
        event.preventDefault()
        const delta = ((event.deltaX || event.deltaY) / box.width) * span
        const nextFrom = clamp(from + delta, 0, duration - span)
        setView({ from: nextFrom, to: nextFrom + span })
      }
    }
    timeline.addEventListener('wheel', onWheel, { passive: false })
    return () => timeline.removeEventListener('wheel', onWheel)
  }, [duration, from, span, view])

  const timeAt = (clientX: number): number => {
    const box = trackRef.current?.getBoundingClientRect()
    if (!box) return 0
    return clamp(from + ((clientX - box.left) / box.width) * span, 0, duration)
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (disabled || duration <= 0 || event.button !== 0) return
    const role = (event.target as HTMLElement).dataset.role
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
  }

  const onDrawingPointerDown = (event: PointerEvent<HTMLDivElement>, drawing: TimelineDrawing): void => {
    if (disabled || event.button !== 0) return
    event.stopPropagation()
    const { role, time } = (event.target as HTMLElement).dataset
    if (role === 'keyframe') return onDrawingSelect(drawing.id, Number(time))
    const edit: DrawingEdit = role === 'start' || role === 'end' ? role : 'move'
    event.currentTarget.setPointerCapture(event.pointerId)
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
    onDrawingDragEnd()
  }

  const pxPerSecond = width / span
  const step = TICK_STEPS.find((candidate) => candidate * pxPerSecond >= MIN_TICK_PX) ?? 7200
  const ticks: number[] = []
  if (duration > 0) {
    for (let tick = Math.ceil(from / step) * step; tick <= to + 1e-9; tick += step) ticks.push(tick)
  }
  const frameSpan = frames.length > 0 ? duration / frames.length : 0
  const lanes = drawings.reduce((count, drawing) => Math.max(count, drawing.lane + 1), 0)

  return (
    <div ref={timelineRef} className={styles.timeline} data-disabled={disabled || undefined}>
      <div className={styles.ruler} aria-hidden>
        {ticks.map((tick) => (
          <span key={tick} className={styles.tick} style={{ left: `${pct(tick)}%` }}>
            {formatTime(tick, step < 1 ? 1 : 0)}
          </span>
        ))}
        {view ? <span className={styles.zoomHint}>Zoom · doble clic para ver todo</span> : null}
      </div>

      <div
        ref={trackRef}
        className={styles.track}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => setView(null)}
      >
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
                style={{ left: `${pct(start)}%`, width: `${(frameSpan / span) * 100}%` }}
              />
            )
          })}
        </div>

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
        <div className={styles.drawings} style={{ height: VISIBLE_LANES * LANE_PX }} aria-label="Dibujos en la línea de tiempo">
          <div className={styles.drawingRows} style={{ height: lanes * LANE_PX }}>
            {drawings.map((drawing) => {
              if (drawing.end < from || drawing.start > to) return null
              return (
                <div
                  key={drawing.id}
                  className={styles.drawingBar}
                  data-selected={drawing.id === selectedDrawingId || undefined}
                  style={{
                    left: `${pct(drawing.start)}%`,
                    width: `${((drawing.end - drawing.start) / span) * 100}%`,
                    top: drawing.lane * LANE_PX,
                    ['--drawing-color' as string]: drawing.color
                  }}
                  title={`${drawing.label} · ${formatTime(drawing.start)} → ${formatTime(drawing.end)}`}
                  onPointerDown={(event) => onDrawingPointerDown(event, drawing)}
                  onPointerMove={onDrawingPointerMove}
                  onPointerUp={endDrawingDrag}
                  onPointerCancel={endDrawingDrag}
                >
                  <span className={styles.drawingEdge} data-role="start" data-side="start" />
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
        </div>
      ) : null}
    </div>
  )
}
