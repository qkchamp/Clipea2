import { useEffect, useState } from 'react'
import { Clapperboard, Play, Trash } from 'lucide-react'
import { formatDuration } from '@shared/domain/time'
import { Button } from '@shared/ui/atoms'
import { EmptyState, PanelHeader } from '@shared/ui/molecules'
import { useThumbnail } from '@features/media/ui/useThumbnail'
import { usePlayerStore } from '@features/player/ui/playerStore'
import { useTrimStore } from '@features/trimming/ui/trimStore'
import { montageDuration, type Segment } from '../domain/montage'
import { SegmentCard } from './SegmentCard'
import { useMontageStore } from './montageStore'
import styles from './montage.module.css'

function ConnectedSegmentCard(props: Omit<Parameters<typeof SegmentCard>[0], 'thumbnail'>) {
  const thumbnail = useThumbnail(props.segment.sourcePath, props.segment.start + 0.05)
  return <SegmentCard {...props} thumbnail={thumbnail} />
}

const previewItem = (segment: Segment) => ({
  id: segment.id,
  sourcePath: segment.sourcePath,
  start: segment.start,
  end: segment.end
})

/** Ordered pieces (from any recording) that become one clip. */
export function MontagePanel() {
  const segments = useMontageStore((state) => state.segments)
  const preview = usePlayerStore((state) => state.preview)
  const editingId = useTrimStore((state) => state.editingSegmentId)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const playingId = preview?.items[preview.index]?.id

  useEffect(() => {
    if (!confirmClear) return
    const timer = window.setTimeout(() => setConfirmClear(false), 3000)
    return () => window.clearTimeout(timer)
  }, [confirmClear])

  const montage = useMontageStore.getState
  const resetDrag = (): void => {
    setDragIndex(null)
    setDropIndex(null)
  }

  const edit = (segment: Segment): void => {
    const player = usePlayerStore.getState()
    player.stopPreview()
    useTrimStore.getState().editSegment(segment.id, segment.sourcePath, { start: segment.start, end: segment.end })
    player.open(segment.sourcePath, { time: segment.start + 0.001, play: false })
  }

  return (
    <section className={styles.panel} aria-label="Montaje">
      {segments.length > 0 ? (
        <PanelHeader
          meta={`${segments.length} ${segments.length === 1 ? 'corte' : 'cortes'} · ${formatDuration(montageDuration(segments))}`}
          actions={
            <>
              <Button
                size="sm"
                variant="ghost"
                icon={<Play size={14} />}
                onClick={() => usePlayerStore.getState().startPreview(segments.map(previewItem))}
              >
                Ver
              </Button>
              <Button
                size="sm"
                variant={confirmClear ? 'danger' : 'ghost'}
                icon={<Trash size={14} />}
                onClick={() => {
                  if (!confirmClear) return setConfirmClear(true)
                  montage().clear()
                  useTrimStore.getState().stopEditing()
                  setConfirmClear(false)
                }}
              >
                {confirmClear ? '¿Vaciar?' : 'Vaciar'}
              </Button>
            </>
          }
        />
      ) : null}

      {segments.length === 0 ? (
        <EmptyState icon={<Clapperboard size={18} />} title="Juntá varios cortes en un clip">
          Marcá inicio y fin, y tocá Agregar al montaje (Enter). Podés sumar trozos de distintos videos y reordenarlos
          arrastrando. Si no agregás nada, se exporta la selección actual.
        </EmptyState>
      ) : (
        <ol className={styles.list}>
          {segments.map((segment, index) => (
            <ConnectedSegmentCard
              key={segment.id}
              number={index + 1}
              segment={segment}
              playing={playingId === segment.id}
              editing={editingId === segment.id}
              dropTarget={dropIndex === index && dragIndex !== null && dragIndex !== index}
              isFirst={index === 0}
              isLast={index === segments.length - 1}
              onPlay={() => usePlayerStore.getState().startPreview([previewItem(segment)])}
              onEdit={() => edit(segment)}
              onRemove={() => {
                if (editingId === segment.id) useTrimStore.getState().stopEditing()
                montage().remove(segment.id)
              }}
              onMove={(direction) => montage().move(index, index + direction)}
              onDragStart={(event) => {
                setDragIndex(index)
                event.dataTransfer.effectAllowed = 'move'
                event.dataTransfer.setData('text/plain', segment.id)
              }}
              onDragOver={(event) => {
                if (dragIndex === null) return
                event.preventDefault()
                setDropIndex(index)
              }}
              onDrop={(event) => {
                event.preventDefault()
                if (dragIndex !== null) montage().move(dragIndex, index)
                resetDrag()
              }}
              onDragEnd={resetDrag}
            />
          ))}
        </ol>
      )}
    </section>
  )
}
