import { useMemo } from 'react'
import { PenLine, Trash } from 'lucide-react'
import { formatTime } from '@shared/domain/time'
import { cx } from '@shared/ui/cx'
import { IconButton } from '@shared/ui/atoms'
import { PanelHeader } from '@shared/ui/molecules'
import { usePlayerStore } from '@features/player/ui/playerStore'
import { annotationLabel, annotationsForSource } from '../domain/annotation'
import { useAnnotationStore } from './annotationStore'
import styles from './annotations.module.css'

/** Drawings of the video on screen: jump to them or delete them. */
export function AnnotationList() {
  const sourcePath = usePlayerStore((state) => state.sourcePath)
  const annotations = useAnnotationStore((state) => state.annotations)
  const selectedId = useAnnotationStore((state) => state.selectedId)
  const remove = useAnnotationStore((state) => state.remove)
  const list = useMemo(() => (sourcePath ? annotationsForSource(annotations, sourcePath) : []), [annotations, sourcePath])

  if (!sourcePath || list.length === 0) return null

  return (
    <section className={styles.list} aria-label="Dibujos de este video">
      <PanelHeader title="Dibujos" meta={`${list.length} en este video`} />
      <ul className={styles.items}>
        {list.map((annotation) => (
          <li key={annotation.id} className={styles.item}>
            <button
              type="button"
              className={styles.itemMain}
              aria-current={annotation.id === selectedId || undefined}
              title="Ir a este dibujo"
              onClick={() => {
                useAnnotationStore.getState().select(annotation.id)
                const player = usePlayerStore.getState()
                player.controller?.pause()
                player.controller?.seek(annotation.start + 0.001)
              }}
            >
              <PenLine size={14} style={{ color: annotation.shape.style.color }} />
              <span className={styles.itemLabel}>{annotationLabel(annotation)}</span>
              <span className={cx(styles.itemMeta, 'tabular')}>
                {formatTime(annotation.start)} → {formatTime(annotation.end)}
              </span>
            </button>
            <IconButton small label="Borrar dibujo" onClick={() => remove(annotation.id)}>
              <Trash size={14} />
            </IconButton>
          </li>
        ))}
      </ul>
    </section>
  )
}
