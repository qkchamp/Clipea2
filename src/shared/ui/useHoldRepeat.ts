import { useEffect, useRef, type MouseEvent, type PointerEvent } from 'react'

/** Wait before repeating, then one action per interval (like holding a key down). */
const HOLD_DELAY_MS = 300
const REPEAT_MS = 50

/**
 * Press: the action runs once. Keep it pressed: it repeats until released. Keyboard activation
 * (Enter / Space) still runs it once through the click.
 */
export function useHoldRepeat(action: () => void) {
  const actionRef = useRef(action)
  actionRef.current = action
  const timers = useRef<{ delay?: number; repeat?: number }>({})

  const stop = (): void => {
    window.clearTimeout(timers.current.delay)
    window.clearInterval(timers.current.repeat)
    timers.current = {}
  }

  useEffect(() => stop, [])

  return {
    onPointerDown: (event: PointerEvent<HTMLButtonElement>): void => {
      if (event.button !== 0) return
      event.currentTarget.setPointerCapture(event.pointerId)
      stop()
      actionRef.current()
      timers.current.delay = window.setTimeout(() => {
        timers.current.repeat = window.setInterval(() => actionRef.current(), REPEAT_MS)
      }, HOLD_DELAY_MS)
    },
    onPointerUp: stop,
    onPointerCancel: stop,
    onLostPointerCapture: stop,
    // Pointer presses already ran on pointerdown; only keyboard clicks (detail 0) get here to act.
    onClick: (event: MouseEvent<HTMLButtonElement>): void => {
      if (event.detail === 0) actionRef.current()
    }
  }
}
