import { useEffect, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatTime, parseTime } from '@shared/domain/time'
import { IconButton, TextInput } from '../atoms'
import { cx } from '../cx'
import styles from '../ui.module.css'

interface SegmentOption<T extends string> {
  value: T
  label: ReactNode
  title?: string
  disabled?: boolean
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  onHoverChange,
  label
}: {
  value: T
  options: readonly SegmentOption<T>[]
  onChange: (value: T) => void
  /** The option under the pointer; null once it leaves the control. */
  onHoverChange?: (value: T | null) => void
  label: string
}) {
  return (
    <div className={styles.segmented} role="radiogroup" aria-label={label} onPointerLeave={() => onHoverChange?.(null)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          title={option.title}
          disabled={option.disabled}
          className={cx(styles.segment, option.value === value && styles.selected)}
          onClick={() => onChange(option.value)}
          onPointerEnter={() => onHoverChange?.(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** Not a <label>: it would forward clicks on the caption to the first button of a SegmentedControl. */
export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      {children}
      {hint ? <span className={styles.fieldHint}>{hint}</span> : null}
    </div>
  )
}

/** Time box that accepts "50", "1:19", "1m19s"… and commits on Enter or blur. */
export function TimeField({
  label,
  value,
  onCommit,
  disabled
}: {
  label: string
  value: number
  onCommit: (seconds: number) => void
  disabled?: boolean
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const parsed = draft === null ? value : parseTime(draft)

  useEffect(() => setDraft(null), [value])

  const commit = (): void => {
    if (draft === null) return
    if (parsed !== null) onCommit(parsed)
    setDraft(null)
  }

  return (
    <span className={styles.timeField}>
      <TextInput
        aria-label={label}
        title={`${label}: escribí 50, 1:19 o 1m19s`}
        value={draft ?? formatTime(value)}
        invalid={draft !== null && parsed === null}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={(event) => event.target.select()}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            commit()
            event.currentTarget.blur()
          } else if (event.key === 'Escape') {
            setDraft(null)
            event.currentTarget.blur()
          }
        }}
      />
    </span>
  )
}

export function PanelHeader({
  title,
  meta,
  actions,
  className
}: {
  title?: string
  meta?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <header className={cx(styles.panelHeader, className)}>
      {title ? <h2 className={styles.panelTitle}>{title}</h2> : null}
      {meta ? <span className={styles.panelMeta}>{meta}</span> : null}
      {actions ? <div className={styles.panelActions}>{actions}</div> : null}
    </header>
  )
}

interface TabOption<T extends string> {
  value: T
  label: ReactNode
  count?: number
}

/** "strip": the full-width band of the sidebar. "segmented": compact, like a SegmentedControl with the open tab in orange. */
export function Tabs<T extends string>({
  value,
  options,
  onChange,
  label,
  variant = 'strip',
  className
}: {
  value: T
  options: readonly TabOption<T>[]
  onChange: (value: T) => void
  label: string
  variant?: 'strip' | 'segmented'
  className?: string
}) {
  const segmented = variant === 'segmented'
  return (
    <div className={cx(segmented ? cx(styles.segmented, styles.tabsSegmented) : styles.tabs, className)} role="tablist" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          className={
            segmented
              ? cx(styles.segment, option.value === value && cx(styles.selected, styles.tabOpen))
              : cx(styles.tab, option.value === value && styles.tabSelected)
          }
          onClick={() => onChange(option.value)}
        >
          {option.label}
          {option.count ? <span className={styles.tabCount}>{option.count}</span> : null}
        </button>
      ))}
    </div>
  )
}

const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const WEEKDAYS = ['lu', 'ma', 'mi', 'ju', 'vi', 'sá', 'do']

const sameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/** A month to pick a day from, Monday first, like the date pickers of Windows. Opens on `value`'s month, or today's. */
export function Calendar({ value, onPick }: { value: Date | null; onPick: (day: Date) => void }) {
  const [month, setMonth] = useState(() => {
    const start = value ?? new Date()
    return new Date(start.getFullYear(), start.getMonth(), 1)
  })
  const today = new Date()
  // Six weeks from the Monday on or before the 1st: every month fits and the grid never changes size.
  const first = new Date(month.getFullYear(), month.getMonth(), 1 - ((month.getDay() + 6) % 7))
  const days = Array.from({ length: 42 }, (_, index) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + index))
  const move = (months: number): void => setMonth(new Date(month.getFullYear(), month.getMonth() + months, 1))

  return (
    <div className={styles.calendar}>
      <div className={styles.calendarHeader}>
        <IconButton small label="Mes anterior" onClick={() => move(-1)}>
          <ChevronLeft size={16} />
        </IconButton>
        <span className={styles.calendarTitle} aria-live="polite">
          {MONTH_NAMES[month.getMonth()]} {month.getFullYear()}
        </span>
        <IconButton small label="Mes siguiente" onClick={() => move(1)}>
          <ChevronRight size={16} />
        </IconButton>
      </div>
      <div className={styles.calendarGrid}>
        {WEEKDAYS.map((name) => (
          <span key={name} className={styles.calendarWeekday} aria-hidden>
            {name}
          </span>
        ))}
        {days.map((day) => (
          <button
            key={day.getTime()}
            type="button"
            className={cx(
              styles.calendarDay,
              day.getMonth() !== month.getMonth() && styles.calendarOutside,
              sameDay(day, today) && styles.calendarToday
            )}
            aria-pressed={value !== null && sameDay(day, value)}
            aria-label={`${day.getDate()} de ${MONTH_NAMES[day.getMonth()]} de ${day.getFullYear()}`}
            onClick={() => onPick(day)}
          >
            {day.getDate()}
          </button>
        ))}
      </div>
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  children,
  className
}: {
  icon: ReactNode
  title: string
  children?: ReactNode
  className?: string
}) {
  return (
    <div className={cx(styles.empty, className)}>
      <span className={styles.emptyIcon}>{icon}</span>
      <p className={styles.emptyTitle}>{title}</p>
      {children ? <p className={styles.emptyBody}>{children}</p> : null}
    </div>
  )
}
