import { Keyboard, Pause, PenLine, Play, Settings, StepBack, StepForward } from 'lucide-react'
import { formatTime } from '@shared/domain/time'
import { IconButton } from '@shared/ui/atoms'
import { cx } from '@shared/ui/cx'
import { useHoldRepeat } from '@shared/ui/useHoldRepeat'
import { useUiStore } from '@shared/ui/uiStore'
import { useAnnotationStore } from '@features/annotations/ui/annotationStore'
import { ffmpegOutdated, useSettingsStore } from '@features/settings/ui/settingsStore'
import { frameNumberAt, frameStartTime } from '../domain/frameClock'
import { usePlayerStore } from './playerStore'
import { RateControl } from './RateControl'
import { useFrameClock } from './useFrameClock'
import { VolumeControl } from './VolumeControl'
import styles from './player.module.css'

/** Time and frame number: the only part of the controls that changes on every frame. */
function PlaybackClock({ sourcePath }: { sourcePath: string | null }) {
  const currentTime = usePlayerStore((state) => state.currentTime)
  const clock = useFrameClock()
  return (
    <div className={cx(styles.clock, 'tabular')}>
      <span className={styles.clockTime}>
        <span className={styles.clockCurrent}>{formatTime(frameStartTime(clock, currentTime))}</span>
        <span className={styles.clockTotal}>/ {formatTime(clock.duration)}</span>
      </span>
      <span
        className={styles.frameCounter}
        title={clock.index ? 'Número de cuadro exacto' : 'Cuadro aproximado (cargando la tabla de cuadros)'}
      >
        <span>f</span>
        <span>{sourcePath ? frameNumberAt(clock, currentTime) + 1 : 0}</span>
      </span>
    </div>
  )
}

export function PlayerControls() {
  const sourcePath = usePlayerStore((state) => state.sourcePath)
  const playing = usePlayerStore((state) => state.playing)
  const controller = usePlayerStore((state) => state.controller)
  const drawing = useAnnotationStore((state) => state.drawing)
  const outdated = useSettingsStore(ffmpegOutdated)
  const disabled = !sourcePath
  // Click: one frame. Hold: keeps stepping frame by frame until released.
  const stepBack = useHoldRepeat(() => usePlayerStore.getState().controller?.stepFrame(-1))
  const stepForward = useHoldRepeat(() => usePlayerStore.getState().controller?.stepFrame(1))

  return (
    <div className={styles.controls}>
      <PlaybackClock sourcePath={sourcePath} />

      <div className={styles.transport}>
        <IconButton label="Cuadro anterior (Ctrl+←) · mantené apretado para seguir" disabled={disabled} {...stepBack}>
          <StepBack size={17} />
        </IconButton>
        <button
          type="button"
          className={styles.playButton}
          aria-label={playing ? 'Pausa (Espacio)' : 'Reproducir (Espacio)'}
          title={`${playing ? 'Pausa' : 'Reproducir'} (Espacio) · rueda: cuadro a cuadro`}
          disabled={disabled}
          onClick={() => controller?.togglePlay()}
          // Wheel up steps one frame forward, down one frame back.
          onWheel={(event) => controller?.stepFrame(event.deltaY < 0 ? 1 : -1)}
        >
          {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
        </button>
        <IconButton label="Cuadro siguiente (Ctrl+→) · mantené apretado para seguir" disabled={disabled} {...stepForward}>
          <StepForward size={17} />
        </IconButton>
      </div>

      <div className={styles.controlsEnd}>
        <VolumeControl />
        <RateControl />
        <div className={styles.toolGroup}>
          <IconButton
            label="Dibujar (D)"
            active={drawing}
            disabled={disabled}
            onClick={() => useAnnotationStore.getState().setDrawing(!drawing)}
          >
            <PenLine size={17} />
          </IconButton>
        </div>
        <div className={styles.toolGroup}>
          <IconButton label="Atajos de teclado (?)" onClick={() => useUiStore.getState().openDialog('help')}>
            <Keyboard size={17} />
          </IconButton>
          <IconButton
            label={outdated ? 'Ajustes · hay una versión nueva de ffmpeg' : 'Ajustes'}
            className={styles.withDot}
            onClick={() => useUiStore.getState().openDialog('settings')}
          >
            <Settings size={17} />
            {outdated ? <span className={styles.dot} /> : null}
          </IconButton>
        </div>
      </div>
    </div>
  )
}
