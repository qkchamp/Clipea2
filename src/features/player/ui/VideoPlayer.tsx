import { useEffect, useRef, useState } from 'react'
import { CircleAlert, Clapperboard, Snowflake, Square } from 'lucide-react'
import { toMediaUrl } from '@shared/contracts/mediaUrl'
import { clamp } from '@shared/domain/time'
import { Badge, Button, Kbd } from '@shared/ui/atoms'
import { freezeCrossed, snapToFrames, type Annotation } from '@features/annotations/domain/annotation'
import type { VideoRect } from '@features/annotations/ui/AnnotationLayer'
import { useAnnotationStore } from '@features/annotations/ui/annotationStore'
import { useMediaStore } from '@features/media/ui/mediaStore'
import { untracked } from '@features/undo/ui/undoStore'
import { frameDuration, frameStepTarget, seekTimeForFrameAt } from '../domain/frameClock'
import { canRecover } from '../domain/mediaRecovery'
import { DrawingToolbar, PlayerOverlay } from './PlayerOverlay'
import { usePlayerStore, type PlayerController } from './playerStore'
import { SpeedOsd } from './SpeedOsd'
import { getFrameClock, useFrameClock } from './useFrameClock'
import logo from '@shared/ui/assets/logo.svg'
import styles from './player.module.css'

/** Container of the <video>: owns playback, frame stepping, freezes and the drawing overlay. */
export function VideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [rect, setRect] = useState<VideoRect | null>(null)
  const [error, setError] = useState<string | null>(null)

  const sourcePath = usePlayerStore((state) => state.sourcePath)
  const rate = usePlayerStore((state) => state.rate)
  const volume = usePlayerStore((state) => state.volume)
  const muted = usePlayerStore((state) => state.muted)
  const freezingId = usePlayerStore((state) => state.freezingId)
  const osd = usePlayerStore((state) => state.osd)
  const preview = usePlayerStore((state) => state.preview)
  const drawing = useAnnotationStore((state) => state.drawing)
  const frameIndex = useFrameClock().index

  useEffect(() => {
    if (!sourcePath) return
    setError(null)
    const media = useMediaStore.getState()
    media.ensureInfo(sourcePath).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))
    void media.ensureFrameIndex(sourcePath)
  }, [sourcePath])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.defaultPlaybackRate = rate
    video.playbackRate = rate
  }, [rate, sourcePath])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.volume = volume
    video.muted = muted
  }, [volume, muted, sourcePath])

  useEffect(() => {
    if (drawing) usePlayerStore.getState().controller?.pause()
  }, [drawing])

  // Drawings made before the exact frame table arrived were pinned with the nominal rate.
  useEffect(() => {
    if (!sourcePath || !frameIndex) return
    const store = useAnnotationStore.getState()
    const snapped = snapToFrames(store.annotations, sourcePath, (time) => frameIndex.timeOf(frameIndex.indexAt(time)))
    if (snapped !== store.annotations) untracked(() => store.replaceAll([...snapped]))
  }, [sourcePath, frameIndex])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const player = usePlayerStore.getState
    let pendingTarget: number | null = null
    /** Latest target asked while another seek was still decoding (scrubbing fires dozens per second). */
    let queuedSeek: number | null = null
    let recoveries: number[] = []
    let lastFrameTime: number | null = null
    let skipFreezeCheck = false
    let freezeTimer: number | undefined
    let frameRequest = 0

    const measure = (): void => {
      const stage = stageRef.current
      if (!stage || !video.videoWidth) return setRect(null)
      const scale = Math.min(stage.clientWidth / video.videoWidth, stage.clientHeight / video.videoHeight)
      const contentWidth = video.videoWidth * scale
      const contentHeight = video.videoHeight * scale
      setRect({
        left: (stage.clientWidth - contentWidth) / 2,
        top: (stage.clientHeight - contentHeight) / 2,
        width: contentWidth,
        height: contentHeight
      })
    }

    const cancelFreeze = (): void => {
      if (freezeTimer === undefined) return
      window.clearTimeout(freezeTimer)
      freezeTimer = undefined
      player().setFreezing(null)
    }

    const startFreeze = (annotation: Annotation): void => {
      video.pause()
      video.currentTime = seekTimeForFrameAt(getFrameClock(), annotation.time)
      player().setFreezing(annotation.id)
      freezeTimer = window.setTimeout(() => {
        freezeTimer = undefined
        player().setFreezing(null)
        void video.play().catch(() => undefined)
      }, annotation.freezeFor * 1000)
    }

    const checkPreviewEnd = (time: number): void => {
      const preview = player().preview
      if (!preview || video.paused) return
      const item = preview.items[preview.index]
      if (item && item.sourcePath === player().sourcePath && time >= item.end - frameDuration(getFrameClock()) / 2) {
        player().advancePreview()
      }
    }

    const onFrame: VideoFrameRequestCallback = (_now, metadata) => {
      const time = metadata.mediaTime
      const previous = lastFrameTime
      lastFrameTime = time
      if (pendingTarget === null) player().setTime(time)
      if (skipFreezeCheck) {
        skipFreezeCheck = false
      } else if (!video.paused && previous !== null && time > previous && time - previous < 1) {
        const path = player().sourcePath
        const hit = path ? freezeCrossed(useAnnotationStore.getState().annotations, path, previous, time) : undefined
        if (hit) startFreeze(hit)
      }
      checkPreviewEnd(time)
      frameRequest = video.requestVideoFrameCallback(onFrame)
    }

    /** Every seek flushes the GPU decoder: while one runs, only the last target is kept and applied after it. */
    const seekTo = (time: number): void => {
      if (video.seeking) {
        queuedSeek = time
        return
      }
      queuedSeek = null
      video.currentTime = time
    }

    const onLoaded = (): void => {
      setError(null)
      lastFrameTime = null
      pendingTarget = null
      queuedSeek = null
      player().setDuration(video.duration)
      video.defaultPlaybackRate = player().rate
      video.playbackRate = player().rate
      const seek = player().takePendingSeek()
      if (seek) {
        video.currentTime = clamp(seek.time, 0, video.duration)
        if (seek.play) void video.play().catch(() => undefined)
      }
      measure()
    }
    const onSeeking = (): void => {
      skipFreezeCheck = true
    }
    const onSeeked = (): void => {
      if (queuedSeek !== null) {
        const next = queuedSeek
        queuedSeek = null
        video.currentTime = next
        return
      }
      pendingTarget = null
      player().setTime(video.currentTime)
    }
    const onTimeUpdate = (): void => {
      if (video.paused && pendingTarget === null) player().setTime(video.currentTime)
      checkPreviewEnd(video.currentTime)
    }
    const onPlay = (): void => player().setPlaying(true)
    const onPause = (): void => player().setPlaying(false)
    const onEnded = (): void => {
      player().setPlaying(false)
      if (player().preview) player().advancePreview()
    }
    const onError = (): void => {
      const path = player().sourcePath
      if (!path) return
      const failure = video.error
      console.warn(`[Clipea2] error del video (${failure?.code ?? '?'}): ${failure?.message ?? 'sin detalle'}`)
      const now = performance.now()
      if (canRecover(failure?.code, recoveries, now)) {
        recoveries = [...recoveries, now]
        // The file is fine, the decoder is not: reload it and come back to the same frame.
        player().setPendingSeek({ time: queuedSeek ?? pendingTarget ?? player().currentTime, play: player().playing })
        video.load()
        return
      }
      setError('No se pudo reproducir este archivo. ¿Es un video válido?')
    }

    const controller: PlayerController = {
      play: () => {
        cancelFreeze()
        void video.play().catch(() => undefined)
      },
      pause: () => {
        cancelFreeze()
        video.pause()
      },
      togglePlay: () => (video.paused || freezeTimer !== undefined ? controller.play() : controller.pause()),
      seek: (time) => {
        cancelFreeze()
        pendingTarget = null
        const end = Number.isFinite(video.duration) ? video.duration : getFrameClock().duration
        const target = clamp(time, 0, end)
        seekTo(target)
        player().setTime(target)
      },
      seekBy: (delta) => controller.seek((queuedSeek ?? pendingTarget ?? video.currentTime) + delta),
      stepFrame: (delta) => {
        cancelFreeze()
        const wasPlaying = !video.paused
        if (wasPlaying) video.pause()
        // Holding Ctrl+→ (or the button) steps from the last target, not from the frame still decoding.
        const base = queuedSeek ?? pendingTarget ?? (wasPlaying && lastFrameTime !== null ? lastFrameTime : video.currentTime)
        const target = frameStepTarget(getFrameClock(), base, delta)
        pendingTarget = target
        seekTo(target)
        player().setTime(target)
      }
    }

    const listeners: Array<[keyof HTMLVideoElementEventMap, () => void]> = [
      ['loadedmetadata', onLoaded],
      ['seeking', onSeeking],
      ['seeked', onSeeked],
      ['timeupdate', onTimeUpdate],
      ['play', onPlay],
      ['pause', onPause],
      ['ended', onEnded],
      ['error', onError]
    ]
    for (const [name, handler] of listeners) video.addEventListener(name, handler)
    frameRequest = video.requestVideoFrameCallback(onFrame)
    const observer = new ResizeObserver(measure)
    if (stageRef.current) observer.observe(stageRef.current)
    player().setController(controller)

    return () => {
      for (const [name, handler] of listeners) video.removeEventListener(name, handler)
      video.cancelVideoFrameCallback(frameRequest)
      observer.disconnect()
      cancelFreeze()
      player().setController(null)
    }
  }, [])

  const previewItem = preview ? preview.items[preview.index] : null

  return (
    <div className={styles.stageWrap}>
      {drawing && sourcePath ? <DrawingToolbar sourcePath={sourcePath} /> : null}
      <div
        ref={stageRef}
        className={styles.stage}
        onClick={() => !drawing && sourcePath && usePlayerStore.getState().controller?.togglePlay()}
      >
        <video ref={videoRef} className={styles.video} src={sourcePath ? toMediaUrl(sourcePath) : undefined} preload="auto" hidden={!sourcePath} />

        {!sourcePath ? (
          <div className={styles.placeholder}>
            <img src={logo} alt="" width={84} height={84} />
            <p className={styles.placeholderTitle}>
              Elegí un clip <span>de la biblioteca</span>
            </p>
            <p className={styles.placeholderBody}>
              o arrastrá un video acá. Marcá inicio <Kbd>I</Kbd> y fin <Kbd>O</Kbd>, y exportá para Discord.
            </p>
          </div>
        ) : null}

        {rect && sourcePath ? <PlayerOverlay rect={rect} sourcePath={sourcePath} /> : null}

        <SpeedOsd osd={osd} />

        <div className={styles.badges}>
          {previewItem && preview ? (
            <div className={styles.previewBadge} onClick={(event) => event.stopPropagation()}>
              <Clapperboard size={14} />
              Viendo montaje · corte {preview.index + 1}/{preview.items.length}
              <Button size="sm" variant="ghost" icon={<Square size={12} />} onClick={() => usePlayerStore.getState().stopPreview()}>
                Parar
              </Button>
            </div>
          ) : null}
          {freezingId ? (
            <Badge tone="discord">
              <Snowflake size={12} /> Imagen congelada
            </Badge>
          ) : null}
        </div>

        {error ? (
          <div className={styles.error} role="alert">
            <CircleAlert size={18} /> {error}
          </div>
        ) : null}
      </div>
    </div>
  )
}
