import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../atoms'
import { Dialog } from './Dialog'
import styles from './dialog.module.css'

interface ConfirmDialogProps {
  title: string
  /** What happens with a yes. */
  children: ReactNode
  confirmLabel: string
  /** Red yes: the action replaces something. */
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}

/**
 * Yes or no before an action that starts right away and is not undone with a click. It goes to the
 * body, so a panel deep in a column can ask it over the whole window.
 */
export function ConfirmDialog({ title, children, confirmLabel, danger = false, onConfirm, onClose }: ConfirmDialogProps) {
  return createPortal(
    <Dialog title={title} size="sm" onClose={onClose}>
      <div className={styles.confirm}>
        <p className={styles.question}>{children}</p>
        <div className={styles.answers}>
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={() => {
              onClose()
              onConfirm()
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>,
    document.body
  )
}
