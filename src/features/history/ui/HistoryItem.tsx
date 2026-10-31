import { useEffect, useState, type Ref } from 'react'
import { CircleCheck, FolderOpen, Info, Pencil, Play, RotateCw, Send, Trash, TriangleAlert } from 'lucide-react'
import { formatBytes, formatDuration, formatTime } from '@shared/domain/time'
import { cx } from '@shared/ui/cx'
import { useResetOnShow } from '@shared/ui/useResetOnShow'
import { useT } from '@shared/ui/useT'
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
  onToggle: () => void
  onCopy: () => Promise<void>
  /** Opens «Enviar a canal»: the clip goes to a saved channel through its webhook. */
  onSendToChannel: () => void
  onShowInFolder: () => void
  onWatch: () => void
  /** Asks first, then where to save it. */
  onReexport: () => void
  /** Asks first when it would replace the current montage. */
  onEdit: () => void
  onRemove: () => void
}

export function HistoryItem({
  ref,
  entry,
  thumbnail,
  sizeLimitBytes,
  expanded,
  isNew,
  exportBusy,
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
  const [showSpecs, setShowSpecs] = useState(false)
  const t = useT()
  useResetOnShow(() => {
    setCopyState('idle')
    setShowSpecs(false)
  })
  const canReexport = entry.missingSources === 0 && !exportBusy
  const fits = !exceedsLimit(entry.sizeBytes, sizeLimitBytes)
  const gpu = entry.video.gpu
  const encoding = describeEncoding(entry.video, gpu === undefined ? null : gpu !== null)
  const extras = [
    gpu ? GPU_LABEL[gpu] : gpu === null ? 'CPU' : null,
    t.montage.cuts(entry.segments.length),
    entry.annotations.length > 0 ? t.history.drawings(entry.annotations.length) : null,
    entry.attempts > 1 ? t.history.passes(entry.attempts) : null
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
            aria-label={t.history.specs}
            aria-pressed={showSpecs}
            title={t.history.specs}
            onClick={() => setShowSpecs(!showSpecs)}
          >
            <Info size={12} />
          </button>
          <button
            type="button"
            className={styles.thumbTool}
            aria-label={t.history.watch}
            title={t.history.watch}
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
              {isNew ? <Badge tone="accent">{t.history.isNew}</Badge> : null}
              {formatExportDate(entry.createdAt)}
              {entry.renderSec !== undefined ? t.history.render(formatDuration(entry.renderSec)) : null}
            </span>
            <span className={cx(styles.size, fits ? styles.fits : styles.tooBig)}>
              {fits ? <CircleCheck size={12} /> : <TriangleAlert size={12} />}
              {t.history.size} <strong className="tabular">{formatBytes(entry.sizeBytes)}</strong>/ {sizeLimitBytes === null ? t.common.noLimit : formatBytes(sizeLimitBytes)}
            </span>
          </span>
        </button>
        {!expanded ? (
          <IconButton small label={t.common.copyForDiscord} disabled={!entry.fileExists} onClick={copy}>
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
              <TriangleAlert size={14} /> {t.history.fileGone}
            </p>
          ) : null}
          {entry.missingSources > 0 ? (
            <p className={styles.warning}>
              <TriangleAlert size={14} /> {t.history.missingSources(entry.missingSources)}
            </p>
          ) : null}

          <Button variant="discord" block icon={<DiscordIcon size={16} />} disabled={!entry.fileExists} onClick={copy}>
            {copyState === 'copied' ? t.history.copied : copyState === 'failed' ? t.history.copyFailed : t.common.copyForDiscord}
          </Button>
          <Button variant="secondary" block icon={<Send size={16} />} disabled={!entry.fileExists} onClick={onSendToChannel}>
            {t.history.sendToChannel}
          </Button>

          <div className={styles.secondary}>
            <IconButton
              small
              label={t.history.reexport}
              disabled={!canReexport}
              onClick={onReexport}
            >
              <RotateCw size={14} />
            </IconButton>
            <IconButton
              small
              label={t.history.edit}
              disabled={entry.missingSources > 0}
              onClick={onEdit}
            >
              <Pencil size={14} />
            </IconButton>
            <IconButton small label={t.history.showInFolder} disabled={!entry.fileExists} onClick={onShowInFolder}>
              <FolderOpen size={14} />
            </IconButton>
            <IconButton small label={t.history.remove} onClick={onRemove}>
              <Trash size={14} />
            </IconButton>
          </div>
        </div>
      ) : null}
    </li>
  )
}
