import { useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { cx } from '@shared/ui/cx'
import { useInView } from '@shared/ui/useInView'
import { useMediaStore } from '@features/media/ui/mediaStore'
import { useThumbnail } from '@features/media/ui/useThumbnail'
import type { GameFolder, LibraryClip } from '../domain/libraryClip'
import { ClipRow } from './ClipRow'
import styles from './library.module.css'

const PAGE = 40

/** Loads the preview of a row only once it scrolls into view: some folders have hundreds of clips. */
function LazyClipRow({ clip, active, onOpen }: { clip: LibraryClip; active: boolean; onOpen: () => void }) {
  const [ref, visible] = useInView<HTMLLIElement>()
  const thumbnail = useThumbnail(clip.path, undefined, visible)
  const durationSec = useMediaStore((state) => state.infos[clip.path]?.durationSec ?? null)

  useEffect(() => {
    if (visible) void useMediaStore.getState().ensureInfo(clip.path).catch(() => undefined)
  }, [visible, clip.path])

  return <ClipRow ref={ref} clip={clip} thumbnail={thumbnail} durationSec={durationSec} active={active} onOpen={onOpen} />
}

interface GameGroupProps {
  game: GameFolder
  expanded: boolean
  activePath: string | null
  onToggle: () => void
  onOpen: (path: string) => void
}

export function GameGroup({ game, expanded, activePath, onToggle, onOpen }: GameGroupProps) {
  const [limit, setLimit] = useState(PAGE)
  const hidden = game.clips.length - limit

  return (
    <div className={styles.group}>
      <button type="button" className={styles.groupHeader} aria-expanded={expanded} onClick={onToggle}>
        <ChevronRight size={14} className={cx(styles.chevron, expanded && styles.open)} />
        <span className={styles.groupName}>{game.name}</span>
        <span className={styles.groupCount}>{game.clips.length}</span>
      </button>
      {expanded ? (
        <ul className={styles.clips}>
          {game.clips.slice(0, limit).map((clip) => (
            <LazyClipRow key={clip.path} clip={clip} active={clip.path === activePath} onOpen={() => onOpen(clip.path)} />
          ))}
        </ul>
      ) : null}
      {expanded && hidden > 0 ? (
        <button type="button" className={styles.more} onClick={() => setLimit(limit + PAGE)}>
          Ver {Math.min(PAGE, hidden)} más
        </button>
      ) : null}
    </div>
  )
}
