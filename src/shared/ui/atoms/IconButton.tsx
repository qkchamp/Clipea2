import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from '../cx'
import styles from '../ui.module.css'

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Accessible name; also shown as tooltip (include the shortcut, e.g. "Cuadro siguiente (Ctrl+→)"). */
  label: string
  children: ReactNode
  active?: boolean
  small?: boolean
}

export function IconButton({ label, children, active = false, small = false, className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={active || undefined}
      className={cx(styles.iconButton, active && styles.active, small && styles.small, className)}
      {...rest}
    >
      {children}
    </button>
  )
}
