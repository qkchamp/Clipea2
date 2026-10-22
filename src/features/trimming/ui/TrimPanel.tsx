import { useEffect, useMemo, useRef } from 'react'
import { ArrowRight, Check, Plus, X } from 'lucide-react'
import { formatDuration } from '@shared/domain/time'
import { Button, Kbd } from '@shared/ui/atoms'
import { TimeField } from '@shared/ui/molecules'
import { annotationLabel, annotationsForSource, assignLanes } from '@features/annotations/domain/annotation'
import { EFFECT_LABELS, effectSpans } from '@features/annotations/domain/effects'
import { useAnnotationStore } from '@features/annotations/ui/annotationStore'
import { useMontageStore } from '@features/montage/ui/montageStore'
import { frameDuration, frameStartTime } from '@features/player/domain/frameClock'
import { usePlayerStore } from '@features/player/ui/playerStore'
import { getFrameClock } from '@features/player/ui/useFrameClock'
import { beginGesture } from '@features/undo/ui/undoStore'
import { fullRange, isValidRange, rangeDuration, withEnd, withStart } from '../domain/timeRange'
import { Timeline, TimelinePlayhead, type DrawingEdit } from './Timeline'
import { commitSelection, markInAtPlayhead, markOutAtPlayhead } from './trimActions'
import { useFilmstrip } from './useFilmstrip'
import { useTrimStore } from './trimStore'
import styles from './trimming.module.css'

function Playhead({ duration, toPercent }: { duration: number; toPercent: (time: number) => number }) {
  const currentTime = usePlayerStore((state) => state.currentTime)
  return <TimelinePlayhead time={currentTime} duration={duration} toPercent={toPercent} />
}

/** Nearest frame boundary; the end of the video counts as one, so a drawing can last until the last frame. */
function snapToFrame(time: number, duration: number): number {
  const clock = getFrameClock()
  const frame = frameDuration(clock)
  if (time >= duration - frame / 2) return duration
  return frameStartTime(clock, Math.max(0, time) + frame / 2)
}

/** Drawing bar dragged in the timeline: whole frames, never shorter than one; the video shows the edge being moved. */
function changeDrawingTimes(id: string, start: number, end: number, edit: DrawingEdit, duration: number): void {
  const frame = frameDuration(getFrameClock())
  let from = snapToFrame(start, duration)
  let until = snapToFrame(end, duration)
  if (edit === 'start') from = Math.min(from, until - frame)
  else if (edit === 'end') until = Math.max(until, from + frame)
  else until = from + (end - start)
  useAnnotationStore.getState().setTimes(id, Math.max(0, from), until, edit === 'move')
  usePlayerStore.getState().controller?.seek(edit === 'end' ? until - frame / 2 : from + frame / 2)
}

export function TrimPanel() {
  const sourcePath = usePlayerStore((state) => state.sourcePath)
  const duration = usePlayerStore((state) => state.duration)
  const range = useTrimStore((state) => state.range)
  const rangeSource = useTrimStore((state) => state.rangeSource)
  const editingSegmentId = useTrimStore((state) => state.editingSegmentId)
  const segments = useMontageStore((state) => state.segments)
  const annotations = useAnnotationStore((state) => state.annotations)
  const selectedDrawingId = useAnnotationStore((state) => state.selectedId)
  const drawingMode = useAnnotationStore((state) => state.drawing)
  const frames = useFilmstrip(sourcePath, duration)
  // One undo step per drag of a drawing bar, however many frames it went through.
  const endGesture = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (sourcePath && duration > 0 && rangeSource !== sourcePath) useTrimStore.getState().reset(sourcePath, duration)
  }, [sourcePath, duration, rangeSource])

  const selection = sourcePath && rangeSource === sourcePath ? range : null
  const drawings = useMemo(() => {
    const list = sourcePath ? annotationsForSource(annotations, sourcePath) : []
    const lanes = assignLanes(list)
    return list.map((annotation, index) => ({
      id: annotation.id,
      start: annotation.start,
      end: annotation.end,
      label: annotationLabel(annotation),
      color: annotation.shape.style.color,
      lane: lanes[index],
      keyframes: annotation.keyframes?.map((keyframe) => keyframe.time) ?? [],
      effects: effectSpans(annotation).map((span) => ({ ...span, label: EFFECT_LABELS[span.kind] }))
    }))
  }, [annotations, sourcePath])
  const bands = useMemo(
    () =>
      segments
        .map((segment, index) => ({ ...segment, number: index + 1 }))
        .filter((segment) => segment.sourcePath === sourcePath),
    [segments, sourcePath]
  )
  const editingIndex = segments.findIndex((segment) => segment.id === editingSegmentId)
  const trim = useTrimStore.getState
  const seek = (time: number): void => {
    const player = usePlayerStore.getState()
    player.stopPreview()
    player.controller?.seek(time)
  }

  return (
    <section className={styles.panel} aria-label="Recorte">
      <Timeline
        duration={duration}
        range={selection}
        frames={frames}
        bands={bands}
        drawings={drawings}
        showDrawings={drawingMode || drawings.length > 0}
        selectedDrawingId={selectedDrawingId}
        disabled={!sourcePath}
        onSeek={seek}
        onRangeChange={(next) => trim().setRange(next)}
        onDrawingSelect={(id, time) => {
          useAnnotationStore.getState().select(id)
          const drawing = drawings.find((item) => item.id === id)
          usePlayerStore.getState().controller?.pause()
          if (drawing) seek((time ?? drawing.start) + frameDuration(getFrameClock()) / 2)
        }}
        onDrawingChange={(id, start, end, edit) => {
          endGesture.current ??= beginGesture()
          changeDrawingTimes(id, start, end, edit, duration)
        }}
        onDrawingDragEnd={() => {
          endGesture.current?.()
          endGesture.current = null
        }}
        onDrawingEdit={(id) => {
          const drawing = drawings.find((item) => item.id === id)
          const store = useAnnotationStore.getState()
          store.select(id)
          store.setTool('select')
          store.setDrawing(true)
          // Off its bar the drawing isn't on screen to grab: go to its first frame.
          const half = frameDuration(getFrameClock()) / 2
          const now = usePlayerStore.getState().currentTime
          if (drawing && (now < drawing.start - half || now >= drawing.end - half)) seek(drawing.start + half)
        }}
        onDrawingDelete={(id) => useAnnotationStore.getState().remove(id)}
        renderPlayhead={(toPercent) => <Playhead duration={duration} toPercent={toPercent} />}
      />

      <div className={styles.rangeBar}>
        <div className={styles.point}>
          <Button size="sm" variant="ghost" disabled={!selection} title="Inicio en el cuadro actual (I)" onClick={markInAtPlayhead}>
            Inicio <Kbd>I</Kbd>
          </Button>
          <TimeField
            label="Inicio"
            value={selection?.start ?? 0}
            disabled={!selection}
            onCommit={(time) => selection && trim().setRange(withStart(selection, time, duration))}
          />
        </div>
        <ArrowRight size={15} className={styles.arrow} />
        <div className={styles.point}>
          <Button size="sm" variant="ghost" disabled={!selection} title="Fin después del cuadro actual (O)" onClick={markOutAtPlayhead}>
            Fin <Kbd>O</Kbd>
          </Button>
          <TimeField
            label="Fin"
            value={selection?.end ?? 0}
            disabled={!selection}
            onCommit={(time) => selection && trim().setRange(withEnd(selection, time, duration))}
          />
        </div>
        <div className={styles.duration}>
          Duración <strong className="tabular">{formatDuration(selection ? rangeDuration(selection) : 0)}</strong>
        </div>
        <Button
          size="sm"
          variant="ghost"
          disabled={!sourcePath || duration <= 0}
          title="Seleccionar todo el video"
          onClick={() => sourcePath && trim().setRange(fullRange(duration))}
        >
          Todo
        </Button>

        <div className={styles.rangeActions}>
          {editingIndex >= 0 ? (
            <>
              <span className={styles.editing}>Editando corte #{editingIndex + 1}</span>
              <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={() => trim().stopEditing()}>
                Cancelar
              </Button>
              <Button size="sm" variant="primary" icon={<Check size={14} />} onClick={commitSelection}>
                Guardar corte <Kbd>Enter</Kbd>
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              icon={<Plus size={14} />}
              disabled={!selection || !isValidRange(selection)}
              title="Suma la selección al montaje (podés juntar cortes de varios videos)"
              onClick={commitSelection}
            >
              Agregar al montaje <Kbd>Enter</Kbd>
            </Button>
          )}
        </div>
      </div>
    </section>
  )
}
