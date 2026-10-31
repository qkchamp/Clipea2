import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '@shared/ui/useT'
import { TimelinePreview } from '@features/trimming/ui/TimelinePreview'
import styles from './settings.module.css'

export type TimelineLook = 'on' | 'off'

const LOOKS: readonly TimelineLook[] = ['on', 'off']

/** Between the popup and the control. */
const GAP = 8
/** From the window's edges. */
const MARGIN = 6

/**
 * Ajustes › Timeline anterior: while the pointer is on Activada or Desactivada, both timelines side
 * by side above the control, each over its own button. The one pointed at is lit; "Ahora" marks the
 * current one and "Con el cambio" the other, so it reads as before and after.
 */
export function TimelineLookPreview({
  anchor,
  current,
  hovered
}: {
  anchor: RefObject<HTMLElement | null>
  current: TimelineLook
  hovered: TimelineLook
}) {
  const box = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<{ left: number; top: number; width: number } | null>(null)
  const t = useT()

  useLayoutEffect(() => {
    const popup = box.current
    if (!popup) return
    const update = (): void => {
      const control = anchor.current?.getBoundingClientRect()
      if (!control) return
      // Above the control; under it only when the window has no room above.
      const above = control.top - GAP - popup.offsetHeight
      const top = above >= MARGIN ? above : control.bottom + GAP
      setPlace({ left: Math.round(control.left), top: Math.round(top), width: Math.round(control.width) })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(popup)
    window.addEventListener('resize', update)
    document.addEventListener('scroll', update, true)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
      document.removeEventListener('scroll', update, true)
    }
  }, [anchor])

  return createPortal(
    <div
      ref={box}
      className={styles.lookPreview}
      aria-hidden
      inert
      style={
        place
          ? { width: place.width, transform: `translate(${place.left}px, ${place.top}px)` }
          : { width: anchor.current?.offsetWidth, visibility: 'hidden' }
      }
    >
      {LOOKS.map((look) => (
        <figure key={look} className={styles.look} data-hovered={look === hovered || undefined}>
          <TimelinePreview classic={look === 'on'} />
          <figcaption className={styles.lookCaption}>
            {look === 'on' ? t.common.on : t.common.off}
            <span className={styles.lookTag} data-current={look === current || undefined}>
              {look === current ? t.settings.now : t.settings.withChange}
            </span>
          </figcaption>
        </figure>
      ))}
    </div>,
    document.body
  )
}
