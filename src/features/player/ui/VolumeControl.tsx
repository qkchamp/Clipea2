import type { CSSProperties } from 'react'
import { Mouse, Volume2, VolumeX } from 'lucide-react'
import { IconButton } from '@shared/ui/atoms'
import { parseVolumePercent, stepVolume, volumePercent } from '../domain/volume'
import { PanelField, usePinnedPanel } from './FloatingPanel'
import { usePlayerStore } from './playerStore'
import styles from './player.module.css'

/**
 * The speaker. Hovering it shows the volume bar above it; a click pins that panel open with the
 * percentage and OFF / ON. The wheel over the button or the panel turns it up and down, like the speed.
 */
export function VolumeControl() {
  const volume = usePlayerStore((state) => state.volume)
  const muted = usePlayerStore((state) => state.muted)
  const { open, setOpen, root } = usePinnedPanel()
  const player = usePlayerStore.getState

  return (
    <div
      ref={root}
      className={styles.floating}
      data-open={open || undefined}
      onWheel={(event) => player().setVolume(stepVolume(player().volume, event.deltaY < 0 ? 1 : -1))}
    >
      <div className={styles.floatingPanel}>
        <div className={styles.floatingBox} role="group" aria-label="Volumen">
          {open ? (
            <PanelField
              value={String(volumePercent(volume))}
              suffix="%"
              label="Volumen en porcentaje"
              onApply={(text) => {
                const next = parseVolumePercent(text)
                if (next !== null) player().setVolume(next)
              }}
            />
          ) : (
            <span className={styles.panelEdge}>100%</span>
          )}
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            aria-label="Volumen"
            className={styles.verticalSlider}
            data-muted={muted || undefined}
            style={{ '--fill': `${volumePercent(volume)}%` } as CSSProperties}
            onChange={(event) => player().setVolume(Number(event.target.value))}
          />
          {open ? (
            <div className={styles.panelSwitch} role="group" aria-label="Sonido">
              <button type="button" aria-pressed={muted} onClick={() => player().setMuted(true)}>
                OFF
              </button>
              <button type="button" aria-pressed={!muted} onClick={() => player().setMuted(false)}>
                ON
              </button>
            </div>
          ) : (
            <span className={styles.panelEdge}>0%</span>
          )}
          <span className={styles.wheelHint}>
            <Mouse size={12} />
            rueda
          </span>
        </div>
      </div>
      <IconButton label="Volumen · rueda para ajustar, M silencia" active={open} aria-expanded={open} onClick={() => setOpen(!open)}>
        {muted || volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
      </IconButton>
    </div>
  )
}
