import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { placeTooltip } from '../tooltipPosition'
import styles from './popover.module.css'

interface PopoverProps {
  /** What opens it. The popover hangs from it, and a click on it is not a click "outside". */
  anchor: RefObject<HTMLElement | null>
  /** A bar around the anchor: the popover hangs from its edge instead, so it never covers the bar. */
  edge?: RefObject<HTMLElement | null>
  /** Accessible name. */
  label: string
  onClose: () => void
  children: ReactNode
}

/**
 * A small panel under its button, above everything but dialogs and toasts. It closes with Escape or
 * a click anywhere else, and keeps its keys to itself: arrows on a slider or Delete on a button
 * inside it must not seek the video or delete the picked drawing.
 */
export function Popover({ anchor, edge, label, onClose, children }: PopoverProps) {
  const box = useRef<HTMLDivElement>(null)
  // Read when it fires, so a new function on every render doesn't re-subscribe the listeners.
  const close = useRef(onClose)
  close.current = onClose
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    const content = box.current
    if (!content) return
    const place = (): void => {
      const trigger = anchor.current
      if (!trigger) return
      const size = { width: content.offsetWidth, height: content.offsetHeight }
      // Still centered on the button when it hangs from the bar.
      const own = trigger.getBoundingClientRect()
      const bar = edge?.current?.getBoundingClientRect()
      const box = bar ? { left: own.left, width: own.width, top: bar.top, height: bar.height } : own
      setPosition(placeTooltip(box, size, { width: window.innerWidth, height: window.innerHeight }))
    }
    place()
    // Its content changes size (an effect opens its fields) and the window can change under it.
    const observer = new ResizeObserver(place)
    observer.observe(content)
    window.addEventListener('resize', place)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', place)
    }
  }, [anchor, edge])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target
      if (target instanceof Node && (box.current?.contains(target) || anchor.current?.contains(target))) return
      close.current()
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      // Escape also leaves drawing mode: closing this panel is all it should do now.
      event.stopPropagation()
      event.preventDefault()
      close.current()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [anchor])

  return createPortal(
    <div
      ref={box}
      role="dialog"
      aria-label={label}
      className={styles.popover}
      style={position ? { transform: `translate(${position.left}px, ${position.top}px)` } : { visibility: 'hidden' }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {children}
    </div>,
    document.body
  )
}
