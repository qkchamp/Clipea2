import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { cx } from '../cx'
import styles from '../ui.module.css'

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className={styles.kbd}>{children}</kbd>
}

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'danger' | 'warning' | 'discord'

export function Badge({ tone = 'neutral', children, title }: { tone?: BadgeTone; children: ReactNode; title?: string }) {
  return (
    <span className={cx(styles.badge, styles[`badge-${tone}`])} title={title}>
      {children}
    </span>
  )
}

export function ProgressBar({
  value,
  tone = 'accent',
  label
}: {
  value: number
  tone?: 'accent' | 'success' | 'danger' | 'warning'
  label: string
}) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div className={styles.progress} role="progressbar" aria-label={label} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx(styles.progressFill, tone !== 'accent' && styles[tone])} style={{ width: `${percent}%` }} />
    </div>
  )
}

interface SelectOption<T extends string> {
  value: T
  label: string
}

interface SelectProps<T extends string> extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'> {
  value: T
  options: readonly SelectOption<T>[]
  onChange: (value: T) => void
}

export function Select<T extends string>({ value, options, onChange, className, ...rest }: SelectProps<T>) {
  return (
    <select className={cx(styles.select, className)} value={value} onChange={(event) => onChange(event.target.value as T)} {...rest}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

export function TextInput({ className, invalid, ...rest }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input className={cx(styles.input, invalid && styles.invalid, className)} spellCheck={false} {...rest} />
}
