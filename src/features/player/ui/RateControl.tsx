import { useRef, type CSSProperties } from 'react'
import { flushSync } from 'react-dom'
import { Mouse } from 'lucide-react'
import { cx } from '@shared/ui/cx'
import { useT } from '@shared/ui/useT'
import { formatPlaybackRate, parsePlaybackRate, PLAYBACK_RATE, playbackRateFraction } from '../domain/playbackRate'
import { PanelField, usePinnedPanel } from './FloatingPanel'
import { usePlayerStore } from './playerStore'
import styles from './player.module.css'

/**
 * The speed, built like the volume: hovering shows a bar with the whole range (0.25x to 4x), a click
 * pins it and turns the button's own text into the value to type (Enter applies it and closes), and
 * a double click on the bar goes back to normal. The wheel moves it anywhere over the button or the
 * panel, and the hint in the panel says so.
 */
export function RateControl() {
  const rate = usePlayerStore((state) => state.rate)
  const { open, setOpen, root } = usePinnedPanel()
  const button = useRef<HTMLButtonElement>(null)
  const player = usePlayerStore.getState
  const t = useT()

  return (
    <div
      ref={root}
      className={styles.floating}
      data-open={open || undefined}
      onWheel={(event) => player().stepRate(event.deltaY < 0 ? 1 : -1)}
    >
      <div className={styles.floatingPanel}>
        <div className={styles.floatingBox} role="group" aria-label={t.player.speedGroup}>
          <span className={styles.panelEdge}>{formatPlaybackRate(PLAYBACK_RATE.max)}</span>
          <input
            type="range"
            min={PLAYBACK_RATE.min}
            max={PLAYBACK_RATE.max}
            step={PLAYBACK_RATE.step}
            value={rate}
            aria-label={t.player.speed}
            className={cx(styles.verticalSlider, styles.speedSlider)}
            style={{ '--fill': `${playbackRateFraction(rate) * 100}%` } as CSSProperties}
            onChange={(event) => player().setRate(Number(event.target.value))}
            onDoubleClick={() => player().resetRate()}
          />
          <span className={styles.panelEdge}>{formatPlaybackRate(PLAYBACK_RATE.min)}</span>
          <span className={styles.wheelHint}>
            <Mouse size={12} />
            {t.player.wheel}
          </span>
        </div>
      </div>
      {open ? (
        <PanelField
          value={rate.toFixed(2)}
          suffix="x"
          label={t.player.typeSpeed}
          className={cx(styles.rate, styles.rateField)}
          autoFocus
          onApply={(text) => {
            const next = parsePlaybackRate(text)
            if (next !== null) player().setRate(next)
          }}
          onEnter={() => {
            // Back to the button, focused, so the keyboard keeps its place.
            flushSync(() => setOpen(false))
            button.current?.focus()
          }}
        />
      ) : (
        <button
          ref={button}
          type="button"
          className={styles.rate}
          data-modified={rate !== PLAYBACK_RATE.normal || undefined}
          aria-expanded={false}
          title={t.player.speedTitle}
          onClick={() => setOpen(true)}
        >
          {formatPlaybackRate(rate)}
        </button>
      )}
    </div>
  )
}
