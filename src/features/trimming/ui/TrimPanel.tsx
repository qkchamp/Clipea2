import { useEffect, useMemo } from 'react'
import { ArrowRight, Check, Plus, X } from 'lucide-react'
import { formatDuration } from '@shared/domain/time'
import { Button, Kbd } from '@shared/ui/atoms'
import { TimeField } from '@shared/ui/molecules'
import { annotationsForSource } from '@features/annotations/domain/annotation'
import { useAnnotationStore } from '@features/annotations/ui/annotationStore'
import { useMontageStore } from '@features/montage/ui/montageStore'
import { usePlayerStore } from '@features/player/ui/playerStore'
import { fullRange, isValidRange, rangeDuration, withEnd, withStart } from '../domain/timeRange'
import { Timeline, TimelinePlayhead } from './Timeline'
import { commitSelection, markInAtPlayhead, markOutAtPlayhead } from './trimActions'
import { useFilmstrip } from './useFilmstrip'
import { useTrimStore } from './trimStore'
import styles from './trimming.module.css'

function Playhead({ duration, toPercent }: { duration: number; toPercent: (time: number) => number }) {
  const currentTime = usePlayerStore((state) => state.currentTime)
  return <TimelinePlayhead time={currentTime} duration={duration} toPercent={toPercent} />
}

export function TrimPanel() {
  const sourcePath = usePlayerStore((state) => state.sourcePath)
  const duration = usePlayerStore((state) => state.duration)
  const range = useTrimStore((state) => state.range)
  const rangeSource = useTrimStore((state) => state.rangeSource)
  const editingSegmentId = useTrimStore((state) => state.editingSegmentId)
  const segments = useMontageStore((state) => state.segments)
  const annotations = useAnnotationStore((state) => state.annotations)
  const frames = useFilmstrip(sourcePath, duration)

  useEffect(() => {
    if (sourcePath && duration > 0 && rangeSource !== sourcePath) useTrimStore.getState().reset(sourcePath, duration)
  }, [sourcePath, duration, rangeSource])

  const selection = sourcePath && rangeSource === sourcePath ? range : null
  const markers = useMemo(
    () =>
      sourcePath
        ? annotationsForSource(annotations, sourcePath).map((a) => ({ id: a.id, time: a.time, freeze: a.freezeFor > 0 }))
        : [],
    [annotations, sourcePath]
  )
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
        markers={markers}
        bands={bands}
        disabled={!sourcePath}
        onSeek={seek}
        onRangeChange={(next) => trim().setRange(next)}
        onMarkerClick={(time) => {
          usePlayerStore.getState().controller?.pause()
          seek(time + 0.001)
        }}
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
