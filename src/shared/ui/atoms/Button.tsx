import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { LoaderCircle } from 'lucide-react'
import { cx } from '../cx'
import styles from '../ui.module.css'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'discord'
  size?: 'sm' | 'md' | 'lg'
  icon?: ReactNode
  loading?: boolean
  block?: boolean
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  loading = false,
  block = false,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(styles.button, styles[variant], size !== 'md' && styles[size], block && styles.block, className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <LoaderCircle size={size === 'sm' ? 13 : 16} className={styles.spin} /> : icon}
      {children}
    </button>
  )
}
