import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { placeTooltip } from '../tooltipPosition'
import styles from './tooltip.module.css'

/**
 * Moves an element's title to data-tip, so the native tooltip never shows, and keeps what the
 * title gave screen readers: the name when the element had none, a description otherwise.
 */
function adopt(element: HTMLElement): void {
  const title = element.getAttribute('title')
  if (title === null) return
  element.removeAttribute('title')
  element.dataset.tip = title
  const named = element.hasAttribute('aria-label') || element.hasAttribute('aria-labelledby') || Boolean(element.textContent?.trim())
  if (element.dataset.tipNames !== undefined || !named) {
    element.setAttribute('aria-label', title)
    element.dataset.tipNames = ''
  } else if (element.getAttribute('aria-label') !== title) {
    element.setAttribute('aria-description', title)
  }
}

/**
 * Native tooltips (title) take about a second to appear and Chromium can't make them faster. This
 * shows the same text as soon as the pointer is over the element, for every title in the app.
 */
export function InstantTooltip() {
  const [tip, setTip] = useState<{ text: string; anchor: DOMRect } | null>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let current: HTMLElement | null = null
    // React may set a new title while the pointer is still there ("Reproducir" → "Pausa").
    const watcher = new MutationObserver(() => {
      if (!current) return
      adopt(current)
      const text = current.dataset.tip ?? ''
      setTip((shown) => (shown && text ? { ...shown, text } : shown))
    })
    const hide = (): void => setTip(null)
    const leave = (): void => {
      current = null
      watcher.disconnect()
      hide()
    }
    const over = (event: PointerEvent): void => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[title], [data-tip]') : null
      if (target === current) return
      if (!target) return leave()
      current = target
      watcher.disconnect()
      watcher.observe(target, { attributeFilter: ['title'] })
      adopt(target)
      const text = target.dataset.tip
      if (text) setTip({ text, anchor: target.getBoundingClientRect() })
      else hide()
    }
    const out = (event: PointerEvent): void => {
      if (!event.relatedTarget) leave()
    }
    // Like native tooltips: a press or a key hides it until the pointer moves to something else.
    document.addEventListener('pointerover', over, true)
    document.addEventListener('pointerout', out, true)
    document.addEventListener('pointerdown', hide, true)
    document.addEventListener('keydown', hide, true)
    document.addEventListener('scroll', leave, true)
    window.addEventListener('blur', leave)
    return () => {
      document.removeEventListener('pointerover', over, true)
      document.removeEventListener('pointerout', out, true)
      document.removeEventListener('pointerdown', hide, true)
      document.removeEventListener('keydown', hide, true)
      document.removeEventListener('scroll', leave, true)
      window.removeEventListener('blur', leave)
      watcher.disconnect()
    }
  }, [])

  useLayoutEffect(() => {
    if (!tip || !box.current) {
      setPosition(null)
      return
    }
    const size = { width: box.current.offsetWidth, height: box.current.offsetHeight }
    setPosition(placeTooltip(tip.anchor, size, { width: window.innerWidth, height: window.innerHeight }))
  }, [tip])

  if (!tip) return null
  return createPortal(
    // Placed with a transform: its size never depends on where the previous tip was.
    <div
      ref={box}
      role="tooltip"
      className={styles.tooltip}
      style={position ? { transform: `translate(${position.left}px, ${position.top}px)` } : { visibility: 'hidden' }}
    >
      {tip.text}
    </div>,
    document.body
  )
}
