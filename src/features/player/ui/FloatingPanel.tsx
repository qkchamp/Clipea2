import { useEffect, useRef, useState } from 'react'
import styles from './player.module.css'

/**
 * Open state of a panel that floats above its button: hovering shows it (CSS), a click pins it open
 * until Escape or a click anywhere outside `root`.
 */
export function usePinnedPanel() {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent): void => {
      if (event.target instanceof Node && root.current?.contains(event.target)) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      // Escape also leaves drawing mode: closing this panel is all it should do now.
      event.stopPropagation()
      event.preventDefault()
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open])

  return { open, setOpen, root }
}

interface PanelFieldProps {
  /** What the field shows while nobody is typing in it. */
  value: string
  suffix: string
  label: string
  /** Gets the typed text; it decides what it means and ignores it when it isn't valid. */
  onApply: (text: string) => void
  /** For a field that stands in for something else, like the speed button: its look, focused on mount. */
  className?: string
  autoFocus?: boolean
  /** After Enter applied the value. */
  onEnter?: () => void
}

/** The value of a pinned panel, editable: Enter or leaving the field applies it. */
export function PanelField({ value, suffix, label, onApply, className, autoFocus, onEnter }: PanelFieldProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const apply = (): void => {
    if (draft === null) return
    onApply(draft)
    setDraft(null)
  }
  return (
    <label className={className ?? styles.panelField}>
      <input
        value={draft ?? value}
        inputMode="decimal"
        aria-label={label}
        autoFocus={autoFocus}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={apply}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          // Or the Enter goes on to click whatever takes the focus next, like the button it gives way to.
          event.preventDefault()
          event.currentTarget.blur()
          onEnter?.()
        }}
      />
      {suffix}
    </label>
  )
}
