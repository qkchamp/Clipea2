import type { DragEvent } from 'react'
import { ChevronDown, ChevronUp, GripVertical, Pencil, Play, Trash } from 'lucide-react'
import { formatDuration, formatTime } from '@shared/domain/time'
import { cx } from '@shared/ui/cx'
import { IconButton } from '@shared/ui/atoms'
import { useT } from '@shared/ui/useT'
import { recordingLabel } from '@features/library/domain/libraryClip'
import { segmentDuration, type Segment } from '../domain/montage'
import styles from './montage.module.css'

interface SegmentCardProps {
  number: number
  segment: Segment
  thumbnail: string | null
  playing: boolean
  editing: boolean
  dropTarget: boolean
  isFirst: boolean
  isLast: boolean
  onPlay: () => void
  onEdit: () => void
  onRemove: () => void
  onMove: (direction: -1 | 1) => void
  onDragStart: (event: DragEvent<HTMLLIElement>) => void
  onDragOver: (event: DragEvent<HTMLLIElement>) => void
  onDrop: (event: DragEvent<HTMLLIElement>) => void
  onDragEnd: () => void
}

export function SegmentCard({
  number,
  segment,
  thumbnail,
  playing,
  editing,
  dropTarget,
  isFirst,
  isLast,
  onPlay,
  onEdit,
  onRemove,
  onMove,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd
}: SegmentCardProps) {
  const t = useT()
  // From the path, not the label saved with the cut: the date is written in the language in use.
  const label = recordingLabel(segment.sourcePath)
  return (
    <li
      className={cx(styles.card, playing && styles.playing, editing && styles.editing, dropTarget && styles.dropTarget)}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <span className={styles.grip} aria-hidden>
        <GripVertical size={14} />
      </span>
      <button type="button" className={styles.thumb} onClick={onPlay} title={t.montage.playCut}>
        {thumbnail ? <img src={thumbnail} alt="" draggable={false} /> : null}
        <span className={styles.number}>{number}</span>
        <span className={styles.playIcon}>
          <Play size={16} fill="currentColor" />
        </span>
      </button>
      <div className={styles.info}>
        <span className={styles.label} title={label}>
          {label}
        </span>
        <span className={cx(styles.range, 'tabular')}>
          {formatTime(segment.start)} → {formatTime(segment.end)}
        </span>
        <span className={styles.length}>{formatDuration(segmentDuration(segment))}</span>
      </div>
      <div className={styles.actions}>
        <IconButton small label={t.montage.moveUp} disabled={isFirst} onClick={() => onMove(-1)}>
          <ChevronUp size={14} />
        </IconButton>
        <IconButton small label={t.montage.moveDown} disabled={isLast} onClick={() => onMove(1)}>
          <ChevronDown size={14} />
        </IconButton>
        <IconButton small label={t.montage.editCut} active={editing} onClick={onEdit}>
          <Pencil size={14} />
        </IconButton>
        <IconButton small label={t.montage.remove} onClick={onRemove}>
          <Trash size={14} />
        </IconButton>
      </div>
    </li>
  )
}
