import { useMemo } from 'react'
import { PenLine, Snowflake, Trash } from 'lucide-react'
import { formatTime } from '@shared/domain/time'
import { Badge, IconButton } from '@shared/ui/atoms'
import { PanelHeader } from '@shared/ui/molecules'
import { usePlayerStore } from '@features/player/ui/playerStore'
import { annotationsForSource } from '../domain/annotation'
import { useAnnotationStore } from './annotationStore'
import styles from './annotations.module.css'

/** Drawings of the video on screen: jump to them or delete them. */
export function AnnotationList() {
  const sourcePath = usePlayerStore((state) => state.sourcePath)
  const annotations = useAnnotationStore((state) => state.annotations)
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
              title="Ir a este cuadro"
              onClick={() => {
                const player = usePlayerStore.getState()
                player.controller?.pause()
                player.controller?.seek(annotation.time + 0.001)
              }}
            >
              <PenLine size={14} />
              <span className="tabular">{formatTime(annotation.time)}</span>
              <span className={styles.itemMeta}>
                {annotation.shapes.length} {annotation.shapes.length === 1 ? 'trazo' : 'trazos'} · {annotation.showFor}s
              </span>
              {annotation.freezeFor > 0 ? (
                <Badge tone="discord" title="Congela la imagen">
                  <Snowflake size={11} /> {annotation.freezeFor}s
                </Badge>
              ) : null}
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
