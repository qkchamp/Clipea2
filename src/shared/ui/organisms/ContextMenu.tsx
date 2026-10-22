import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cx } from '../cx'
import styles from './contextMenu.module.css'

export interface MenuItem {
  label: string
  icon?: ReactNode
  /** Shown in red: it deletes something. */
  danger?: boolean
  onSelect: () => void
}

const MARGIN = 6

/**
 * Menu at the pointer, for a right click. It closes with Escape, a click anywhere else or once an
 * option is chosen, and keeps its keys to itself (↑/↓ move between the options).
 */
export function ContextMenu({
  at,
  label,
  items,
  onClose
}: {
  at: { x: number; y: number }
  label: string
  items: readonly MenuItem[]
  onClose: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  // Read when it fires, so a new function on every render doesn't re-subscribe the listeners.
  const close = useRef(onClose)
  close.current = onClose
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    const menu = box.current
    if (!menu) return
    // Right and below the pointer, flipped above it when there is no room, always inside the window.
    const left = Math.max(MARGIN, Math.min(at.x, window.innerWidth - menu.offsetWidth - MARGIN))
    const top = at.y + menu.offsetHeight + MARGIN <= window.innerHeight ? at.y : Math.max(MARGIN, at.y - menu.offsetHeight)
    setPosition({ left, top })
    menu.querySelector<HTMLButtonElement>('button')?.focus()
  }, [at.x, at.y])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      if (event.target instanceof Node && box.current?.contains(event.target)) return
      close.current()
    }
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      // Escape also leaves drawing mode: closing the menu is all it should do now.
      event.stopPropagation()
      event.preventDefault()
      close.current()
    }
    const away = (): void => close.current()
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('scroll', away, true)
    window.addEventListener('resize', away)
    window.addEventListener('blur', away)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('scroll', away, true)
      window.removeEventListener('resize', away)
      window.removeEventListener('blur', away)
    }
  }, [])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    event.stopPropagation()
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const options = [...(box.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
    const current = options.indexOf(document.activeElement as HTMLButtonElement)
    const next = (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length
    options[next]?.focus()
  }

  return createPortal(
    <div
      ref={box}
      role="menu"
      aria-label={label}
      className={styles.menu}
      style={position ? { transform: `translate(${position.left}px, ${position.top}px)` } : { visibility: 'hidden' }}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className={cx(styles.item, item.danger && styles.danger)}
          onClick={() => {
            close.current()
            item.onSelect()
          }}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>,
    document.body
  )
}
