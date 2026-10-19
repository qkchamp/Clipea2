import { useEffect, useState, type Ref } from 'react'
import { CircleCheck, FolderOpen, Info, Pencil, Play, RotateCw, Send, Trash, TriangleAlert } from 'lucide-react'
import { formatBytes, formatDuration, formatTime } from '@shared/domain/time'
import { cx } from '@shared/ui/cx'
import { Badge, Button, DiscordIcon, IconButton } from '@shared/ui/atoms'
import { exceedsLimit } from '@features/export/domain/discordLimits'
import { GPU_LABEL } from '@features/export/domain/encoderSupport'
import { describeEncoding } from '@features/export/domain/encodingPlan'
import { formatExportDate, recordTitle, type HistoryEntry } from '../domain/exportRecord'
import styles from './history.module.css'

interface HistoryItemProps {
  ref?: Ref<HTMLLIElement>
  entry: HistoryEntry
  thumbnail: string | null
  /** Limit chosen in Ajustes right now (the card compares against it, not the one at export time). */
  sizeLimitBytes: number | null
  expanded: boolean
  isNew: boolean
  /** Another export is running: re-export waits. */
  exportBusy: boolean
  /** Editing replaces the current montage, so it asks first. */
  montageHasSegments: boolean
  onToggle: () => void
  onCopy: () => Promise<void>
  /** Pick a server and text channel; Discord opens there with the clip ready to paste. */
  onSendToChannel: () => void
  onShowInFolder: () => void
  onWatch: () => void
  onReexport: () => void
  onEdit: () => void
  onRemove: () => void
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

export function HistoryItem({
  ref,
  entry,
  thumbnail,
  sizeLimitBytes,
  expanded,
  isNew,
  exportBusy,
  montageHasSegments,
  onToggle,
  onCopy,
  onSendToChannel,
  onShowInFolder,
  onWatch,
  onReexport,
  onEdit,
  onRemove
}: HistoryItemProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [confirmEdit, setConfirmEdit] = useState(false)
  const [showSpecs, setShowSpecs] = useState(false)
  const canReexport = entry.missingSources === 0 && !exportBusy
  const fits = !exceedsLimit(entry.sizeBytes, sizeLimitBytes)
  const gpu = entry.video.gpu
  const encoding = describeEncoding(entry.video, gpu === undefined ? null : gpu !== null)
  const extras = [
    gpu ? GPU_LABEL[gpu] : gpu === null ? 'CPU' : null,
    plural(entry.segments.length, 'corte', 'cortes'),
    entry.annotations.length > 0 ? plural(entry.annotations.length, 'dibujo', 'dibujos') : null,
    entry.attempts > 1 ? `${entry.attempts} pasadas` : null
  ].filter(Boolean)

  useEffect(() => {
    if (copyState === 'idle') return
    const timer = window.setTimeout(() => setCopyState('idle'), 2500)
    return () => window.clearTimeout(timer)
  }, [copyState])

  const copy = (): void => {
    onCopy().then(
      () => setCopyState('copied'),
      () => setCopyState('failed')
    )
  }

  return (
    <li ref={ref} className={cx(styles.item, expanded && styles.expanded, isNew && styles.isNew)}>
      <div className={styles.row}>
        <div className={styles.thumbTools}>
          <button
            type="button"
            className={styles.thumbTool}
            aria-label="Con qué ajustes se exportó"
            aria-pressed={showSpecs}
            title="Con qué ajustes se exportó"
            onClick={() => setShowSpecs(!showSpecs)}
          >
            <Info size={12} />
          </button>
          <button
            type="button"
            className={styles.thumbTool}
            aria-label="Ver en el reproductor"
            title="Ver en el reproductor"
            disabled={!entry.fileExists}
            onClick={onWatch}
          >
            <Play size={12} />
          </button>
        </div>
        <button type="button" className={styles.summary} aria-expanded={expanded} onClick={onToggle}>
          <span className={styles.thumb}>
            {thumbnail ? <img src={thumbnail} alt="" draggable={false} decoding="async" /> : null}
            <span className={styles.duration}>{formatTime(entry.durationSec, 0)}</span>
          </span>
          <span className={styles.info}>
            <span className={styles.title} title={entry.path}>
              {recordTitle(entry)}
            </span>
            <span className={styles.meta}>
              {isNew ? <Badge tone="accent">Nuevo</Badge> : null}
              {formatExportDate(entry.createdAt)}
              {entry.renderSec !== undefined ? ` · Render ${formatDuration(entry.renderSec)}` : null}
            </span>
            <span className={cx(styles.size, fits ? styles.fits : styles.tooBig)}>
              {fits ? <CircleCheck size={12} /> : <TriangleAlert size={12} />}
              Peso: <strong className="tabular">{formatBytes(entry.sizeBytes)}</strong>/ {sizeLimitBytes === null ? 'sin límite' : formatBytes(sizeLimitBytes)}
            </span>
          </span>
        </button>
        {!expanded ? (
          <IconButton small label="Copiar para Discord" disabled={!entry.fileExists} onClick={copy}>
            <DiscordIcon size={14} />
          </IconButton>
        ) : null}
      </div>

      {showSpecs ? (
        <div className={styles.specs}>
          <p className={styles.specsMain}>{encoding}</p>
          <p className={styles.specsExtra}>{extras.join(' · ')}</p>
        </div>
      ) : null}

      {expanded ? (
        <div className={styles.details}>
          {!entry.fileExists ? (
            <p className={styles.warning}>
              <TriangleAlert size={13} /> El archivo ya no está en la carpeta. Podés exportarlo de nuevo.
            </p>
          ) : null}
          {entry.missingSources > 0 ? (
            <p className={styles.warning}>
              <TriangleAlert size={13} /> Falta {plural(entry.missingSources, 'video original', 'videos originales')}: no se puede volver a
              exportar.
            </p>
          ) : null}

          <Button variant="discord" block icon={<DiscordIcon size={16} />} disabled={!entry.fileExists} onClick={copy}>
            {copyState === 'copied' ? 'Copiado: Ctrl+V en Discord' : copyState === 'failed' ? 'No se pudo copiar' : 'Copiar para Discord'}
          </Button>
          <Button variant="secondary" block icon={<Send size={15} />} disabled={!entry.fileExists} onClick={onSendToChannel}>
            Enviar a canal
          </Button>

          <div className={styles.secondary}>
            <Button
              size="sm"
              variant="ghost"
              icon={<RotateCw size={13} />}
              disabled={!canReexport}
              title="Exportar de nuevo los mismos cortes y dibujos, con las opciones de exportación actuales"
              onClick={onReexport}
            >
              Reexportar
            </Button>
            <Button
              size="sm"
              variant={confirmEdit ? 'danger' : 'ghost'}
              icon={<Pencil size={13} />}
              disabled={entry.missingSources > 0}
              title="Cargar los cortes y dibujos en el montaje para cambiarlos"
              onClick={() => {
                if (montageHasSegments && !confirmEdit) return setConfirmEdit(true)
                setConfirmEdit(false)
                onEdit()
              }}
              onBlur={() => setConfirmEdit(false)}
            >
              {confirmEdit ? '¿Reemplazar montaje?' : 'Editar'}
            </Button>
            <IconButton small label="Mostrar en la carpeta" disabled={!entry.fileExists} onClick={onShowInFolder}>
              <FolderOpen size={13} />
            </IconButton>
            <IconButton small label="Quitar del historial (el archivo no se borra)" onClick={onRemove}>
              <Trash size={13} />
            </IconButton>
          </div>
        </div>
      ) : null}
    </li>
  )
}
