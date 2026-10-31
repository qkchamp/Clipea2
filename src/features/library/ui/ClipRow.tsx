import type { Ref } from 'react'
import { formatBytes, formatTime } from '@shared/domain/time'
import { cx } from '@shared/ui/cx'
import { useLanguage } from '@shared/ui/useT'
import { describeRecording, formatRecordedAt, type LibraryClip } from '../domain/libraryClip'
import styles from './library.module.css'

interface ClipRowProps {
  ref?: Ref<HTMLLIElement>
  clip: LibraryClip
  thumbnail: string | null
  durationSec: number | null
  active: boolean
  onOpen: () => void
}

export function ClipRow({ ref, clip, thumbnail, durationSec, active, onOpen }: ClipRowProps) {
  // The date and the size are written in the language in use.
  useLanguage()
  const { title, recordedAtMs } = describeRecording(clip.fileName)
  return (
    <li ref={ref}>
      <button
        type="button"
        className={cx(styles.clip, active && styles.active)}
        aria-current={active || undefined}
        data-file={clip.fileName}
        onClick={onOpen}
      >
        <span className={styles.thumb}>
          {thumbnail ? <img src={thumbnail} alt="" draggable={false} decoding="async" /> : null}
          {durationSec ? <span className={styles.duration}>{formatTime(durationSec, 0)}</span> : null}
        </span>
        <span className={styles.clipInfo}>
          <span className={styles.clipTitle}>{recordedAtMs !== null ? formatRecordedAt(recordedAtMs) : title}</span>
          <span className={styles.clipMeta}>
            <span className={styles.clipSize}>{formatBytes(clip.sizeBytes)}</span>
          </span>
        </span>
      </button>
    </li>
  )
}
