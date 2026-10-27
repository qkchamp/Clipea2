import type { CSSProperties } from 'react'
import { Mouse } from 'lucide-react'
import { cx } from '@shared/ui/cx'
import { formatPlaybackRate, parsePlaybackRate, PLAYBACK_RATE, playbackRateFraction } from '../domain/playbackRate'
import { PanelField, usePinnedPanel } from './FloatingPanel'
import { usePlayerStore } from './playerStore'
import styles from './player.module.css'

/**
 * The speed, built like the volume: hovering shows a bar with the whole range (0.25x to 4x), a click
 * pins it with the value to type and a way back to normal. The wheel moves it anywhere over the
 * button or the panel, and the hint in the panel says so.
 */
export function RateControl() {
  const rate = usePlayerStore((state) => state.rate)
  const { open, setOpen, root } = usePinnedPanel()
  const player = usePlayerStore.getState

  return (
    <div
      ref={root}
      className={styles.floating}
      data-open={open || undefined}
      onWheel={(event) => player().stepRate(event.deltaY < 0 ? 1 : -1)}
    >
      <div className={styles.floatingPanel}>
        <div className={styles.floatingBox} role="group" aria-label="Velocidad de reproducción">
          {open ? (
            <PanelField
              value={rate.toFixed(2)}
              suffix="x"
              label="Velocidad"
              onApply={(text) => {
                const next = parsePlaybackRate(text)
                if (next !== null) player().setRate(next)
              }}
            />
          ) : (
            <span className={styles.panelEdge}>{formatPlaybackRate(PLAYBACK_RATE.max)}</span>
          )}
          <input
            type="range"
            min={PLAYBACK_RATE.min}
            max={PLAYBACK_RATE.max}
            step={PLAYBACK_RATE.step}
            value={rate}
            aria-label="Velocidad"
            className={cx(styles.verticalSlider, styles.speedSlider)}
            style={{ '--fill': `${playbackRateFraction(rate) * 100}%` } as CSSProperties}
            onChange={(event) => player().setRate(Number(event.target.value))}
          />
          {open ? (
            <button
              type="button"
              className={styles.panelButton}
              disabled={rate === PLAYBACK_RATE.normal}
              title="Vuelve a 1.00x (Ctrl+R)"
              onClick={() => player().resetRate()}
            >
              Normal
            </button>
          ) : (
            <span className={styles.panelEdge}>{formatPlaybackRate(PLAYBACK_RATE.min)}</span>
          )}
          <span className={styles.wheelHint}>
            <Mouse size={12} />
            rueda
          </span>
        </div>
      </div>
      <button
        type="button"
        className={styles.rate}
        data-modified={rate !== PLAYBACK_RATE.normal || undefined}
        aria-expanded={open}
        title="Velocidad · rueda del mouse o Ctrl+↑/↓, Ctrl+R vuelve a 1.00x"
        onClick={() => setOpen(!open)}
      >
        {formatPlaybackRate(rate)}
      </button>
    </div>
  )
}
