import { CircleCheck, Info, TriangleAlert, X } from 'lucide-react'
import { useUiStore } from '../uiStore'
import styles from './toasts.module.css'

const ICONS = { info: Info, success: CircleCheck, warning: TriangleAlert } as const

/** Short notices at the bottom of the window, with optional actions ("Deshacer", "Copiar"…). */
export function Toasts() {
  const toasts = useUiStore((state) => state.toasts)
  return (
    <div className={styles.stack} role="status" aria-live="polite">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.tone]
        return (
          <div key={toast.id} className={styles.toast} data-tone={toast.tone}>
            <Icon size={16} className={styles.icon} />
            <span className={styles.text}>{toast.text}</span>
            {toast.actions.map((action) => (
              <button
                key={action.label}
                type="button"
                className={styles.action}
                onClick={() => {
                  useUiStore.getState().dismissToast(toast.id)
                  void action.run()
                }}
              >
                {action.label}
              </button>
            ))}
            <button type="button" className={styles.close} aria-label="Cerrar aviso" onClick={() => useUiStore.getState().dismissToast(toast.id)}>
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
