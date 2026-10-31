import { Keyboard, Pause, PenLine, Play, Settings, StepBack, StepForward } from 'lucide-react'
import { formatTime } from '@shared/domain/time'
import { IconButton } from '@shared/ui/atoms'
import { cx } from '@shared/ui/cx'
import { useHoldRepeat } from '@shared/ui/useHoldRepeat'
import { useUiStore } from '@shared/ui/uiStore'
import { useT } from '@shared/ui/useT'
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
  const t = useT()
  return (
    <div className={cx(styles.clock, 'tabular')}>
      <span className={styles.clockTime}>
        <span className={styles.clockCurrent}>{formatTime(frameStartTime(clock, currentTime))}</span>
        <span className={styles.clockTotal}>/ {formatTime(clock.duration)}</span>
      </span>
      <span
        className={styles.frameCounter}
        title={clock.index ? t.player.frameExact : t.player.frameApprox}
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
  const t = useT()
  const disabled = !sourcePath
  // Click: one frame. Hold: keeps stepping frame by frame until released.
  const stepBack = useHoldRepeat(() => usePlayerStore.getState().controller?.stepFrame(-1))
  const stepForward = useHoldRepeat(() => usePlayerStore.getState().controller?.stepFrame(1))

  return (
    <div className={styles.controls}>
      <PlaybackClock sourcePath={sourcePath} />

      <div className={styles.transport}>
        <IconButton label={t.player.previousFrame} disabled={disabled} {...stepBack}>
          <StepBack size={16} />
        </IconButton>
        <button
          type="button"
          className={styles.playButton}
          aria-label={playing ? t.player.pause : t.player.play}
          title={t.player.playTitle(playing)}
          disabled={disabled}
          onClick={() => controller?.togglePlay()}
          // Wheel up steps one frame forward, down one frame back.
          onWheel={(event) => controller?.stepFrame(event.deltaY < 0 ? 1 : -1)}
        >
          {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
        </button>
        <IconButton label={t.player.nextFrame} disabled={disabled} {...stepForward}>
          <StepForward size={16} />
        </IconButton>
      </div>

      <div className={styles.controlsEnd}>
        <VolumeControl />
        <RateControl />
        <div className={styles.toolGroup}>
          <IconButton
            label={t.player.draw}
            active={drawing}
            disabled={disabled}
            onClick={() => useAnnotationStore.getState().setDrawing(!drawing)}
          >
            <PenLine size={16} />
          </IconButton>
        </div>
        <div className={styles.toolGroup}>
          <IconButton label={t.player.shortcuts} onClick={() => useUiStore.getState().openDialog('help')}>
            <Keyboard size={16} />
          </IconButton>
          <IconButton
            label={outdated ? t.player.settingsOutdated : t.player.settings}
            className={styles.withDot}
            onClick={() => useUiStore.getState().openDialog('settings')}
          >
            <Settings size={16} />
            {outdated ? <span className={styles.dot} /> : null}
          </IconButton>
        </div>
      </div>
    </div>
  )
}
