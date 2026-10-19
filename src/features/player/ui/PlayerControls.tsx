import { useRef } from 'react'
import { Keyboard, Minus, Pause, PenLine, Play, Plus, Settings, StepBack, StepForward, Volume2, VolumeX } from 'lucide-react'
import { formatTime } from '@shared/domain/time'
import { Button, IconButton, Kbd } from '@shared/ui/atoms'
import { useCrowded } from '@shared/ui/useCrowded'
import { useHoldRepeat } from '@shared/ui/useHoldRepeat'
import { useUiStore } from '@shared/ui/uiStore'
import { useAnnotationStore } from '@features/annotations/ui/annotationStore'
import { frameNumberAt, frameStartTime, totalFrames } from '../domain/frameClock'
import { formatPlaybackRate, PLAYBACK_RATE } from '../domain/playbackRate'
import { usePlayerStore } from './playerStore'
import { useFrameClock } from './useFrameClock'
import styles from './player.module.css'

/** Time and frame number: the only part of the controls that changes on every frame. */
function PlaybackClock({ sourcePath }: { sourcePath: string | null }) {
  const currentTime = usePlayerStore((state) => state.currentTime)
  const clock = useFrameClock()
  return (
    <div className={styles.clock}>
      <span className="tabular">{formatTime(frameStartTime(clock, currentTime))}</span>
      <span className={styles.clockTotal}>/ {formatTime(clock.duration)}</span>
      <span
        className={styles.frameCounter}
        title={clock.index ? 'Número de cuadro exacto' : 'Cuadro aproximado (cargando la tabla de cuadros)'}
      >
        Cuadro <span className="tabular">{sourcePath ? frameNumberAt(clock, currentTime) + 1 : 0}</span>/
        <span className="tabular">{sourcePath ? totalFrames(clock) : 0}</span>
      </span>
    </div>
  )
}

export function PlayerControls() {
  const sourcePath = usePlayerStore((state) => state.sourcePath)
  const playing = usePlayerStore((state) => state.playing)
  const rate = usePlayerStore((state) => state.rate)
  const volume = usePlayerStore((state) => state.volume)
  const muted = usePlayerStore((state) => state.muted)
  const controller = usePlayerStore((state) => state.controller)
  const drawing = useAnnotationStore((state) => state.drawing)
  const disabled = !sourcePath
  const player = usePlayerStore.getState
  // Click: one frame. Hold: keeps stepping frame by frame until released.
  const stepBack = useHoldRepeat(() => usePlayerStore.getState().controller?.stepFrame(-1))
  const stepForward = useHoldRepeat(() => usePlayerStore.getState().controller?.stepFrame(1))
  // When the row doesn't fit on one line, "Dibujar" shrinks to its icon before anything wraps.
  const row = useRef<HTMLDivElement>(null)
  const crowded = useCrowded(row)

  return (
    <div ref={row} className={styles.controls}>
      <div className={styles.transport}>
        <IconButton label="Cuadro anterior (Ctrl+←) · mantené apretado para seguir" disabled={disabled} {...stepBack}>
          <StepBack size={17} />
        </IconButton>
        <button
          type="button"
          className={styles.playButton}
          aria-label={playing ? 'Pausa (Espacio)' : 'Reproducir (Espacio)'}
          title={playing ? 'Pausa (Espacio)' : 'Reproducir (Espacio)'}
          disabled={disabled}
          onClick={() => controller?.togglePlay()}
        >
          {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
        </button>
        <IconButton label="Cuadro siguiente (Ctrl+→) · mantené apretado para seguir" disabled={disabled} {...stepForward}>
          <StepForward size={17} />
        </IconButton>
      </div>

      <PlaybackClock sourcePath={sourcePath} />

      <div className={styles.rateBox} aria-label="Velocidad de reproducción">
        <IconButton small label="Más lento (Ctrl+↓)" disabled={rate <= PLAYBACK_RATE.min} onClick={() => player().stepRate(-1)}>
          <Minus size={14} />
        </IconButton>
        <button
          type="button"
          className={styles.rate}
          data-modified={rate !== PLAYBACK_RATE.normal || undefined}
          title="Velocidad · clic o Ctrl+R vuelve a 1.00x"
          onClick={() => player().resetRate()}
        >
          {formatPlaybackRate(rate)}
        </button>
        <IconButton small label="Más rápido (Ctrl+↑)" disabled={rate >= PLAYBACK_RATE.max} onClick={() => player().stepRate(1)}>
          <Plus size={14} />
        </IconButton>
      </div>

      <div className={styles.volume}>
        <IconButton label={muted ? 'Activar sonido (M)' : 'Silenciar (M)'} onClick={() => player().toggleMute()}>
          {muted || volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
        </IconButton>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={muted ? 0 : volume}
          aria-label="Volumen"
          className={styles.volumeSlider}
          onChange={(event) => player().setVolume(Number(event.target.value))}
        />
      </div>

      <div className={styles.controlsEnd}>
        <Button
          size="sm"
          variant={drawing ? 'primary' : 'secondary'}
          icon={<PenLine size={14} />}
          className={crowded ? styles.drawCompact : undefined}
          title={crowded ? 'Dibujar (D)' : undefined}
          aria-label={crowded ? 'Dibujar (D)' : undefined}
          disabled={disabled}
          aria-pressed={drawing}
          onClick={() => useAnnotationStore.getState().setDrawing(!drawing)}
        >
          {crowded ? <Kbd>D</Kbd> : <>Dibujar <Kbd>D</Kbd></>}
        </Button>
        <div className={styles.appTools}>
          <IconButton small label="Atajos de teclado (?)" onClick={() => useUiStore.getState().openDialog('help')}>
            <Keyboard size={16} />
          </IconButton>
          <IconButton small label="Ajustes" onClick={() => useUiStore.getState().openDialog('settings')}>
            <Settings size={16} />
          </IconButton>
        </div>
      </div>
    </div>
  )
}
