import type { ReactNode } from 'react'
import { ChevronRight, Folder, FolderOpen } from 'lucide-react'
import { cx } from '@shared/ui/cx'
import { baseName } from '../domain/libraryClip'
import styles from './library.module.css'

interface RootFolderProps {
  root: string
  clipCount: number
  open: boolean
  onToggle: () => void
  children: ReactNode
}

/** A library folder with its games inside; hovering it shows where it lives on disk. */
export function RootFolder({ root, clipCount, open, onToggle, children }: RootFolderProps) {
  return (
    <div className={styles.root}>
      <button type="button" className={styles.rootHeader} aria-expanded={open} title={root} onClick={onToggle}>
        <ChevronRight size={14} className={cx(styles.chevron, open && styles.open)} />
        {open ? <FolderOpen size={14} className={styles.rootIcon} /> : <Folder size={14} className={styles.rootIcon} />}
        <span className={styles.rootName}>{baseName(root) || root}</span>
        <span className={styles.groupCount}>{clipCount}</span>
      </button>
      {open ? <div className={styles.rootBody}>{children}</div> : null}
    </div>
  )
}
