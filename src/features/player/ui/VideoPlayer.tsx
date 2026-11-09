import { useCallback, useEffect, useRef, useState } from 'react'
import { CircleAlert, Clapperboard, LoaderCircle, Square } from 'lucide-react'
import { toMediaUrl } from '@shared/contracts/mediaUrl'
import { clamp } from '@shared/domain/time'
import { getT } from '@shared/i18n'
import { api } from '@shared/ui/api'
import { Button, Kbd } from '@shared/ui/atoms'
import { useT } from '@shared/ui/useT'
import { snapToFrames } from '@features/annotations/domain/annotation'
import type { VideoRect } from '@features/annotations/ui/AnnotationLayer'
import { useAnnotationStore } from '@features/annotations/ui/annotationStore'
import { useMediaStore } from '@features/media/ui/mediaStore'
import { untracked } from '@features/undo/ui/undoStore'
import { frameDuration, frameStepTarget } from '../domain/frameClock'
import { canRecover, needsConversion } from '../domain/mediaRecovery'
import { opensDirectly, playbackPlan } from '../domain/playbackPlan'
import { DrawingToolbar, PlayerOverlay } from './PlayerOverlay'
import { usePlayerStore, type PlayerController } from './playerStore'
import { SpeedOsd } from './SpeedOsd'
import { getFrameClock, useFrameClock } from './useFrameClock'
import logo from '@shared/ui/assets/logo.svg'
import styles from './player.module.css'

/** What the <video> loads in place of a file Chromium does not play: its converted copy, or nothing while ffmpeg makes it. */
interface StandIn {
  source: string
  file: string | null
}

/** A conversion asked for the video on screen; a newer one, or another video, makes its answer stale. */
interface Conversion {
  source: string
  /** The last resort: nothing is left to try if this copy does not play either. */
  reencode: boolean
  running: boolean
}

/** Container of the <video>: owns playback, frame stepping and the drawing overlay. */
export function VideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [rect, setRect] = useState<VideoRect | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [standIn, setStandIn] = useState<StandIn | null>(null)
  /** 0..1 while ffmpeg converts the video on screen. */
  const [converting, setConverting] = useState<number | null>(null)
  const conversion = useRef<Conversion | null>(null)
  const t = useT()

  const sourcePath = usePlayerStore((state) => state.sourcePath)
  const rate = usePlayerStore((state) => state.rate)
  const volume = usePlayerStore((state) => state.volume)
  const muted = usePlayerStore((state) => state.muted)
  const osd = usePlayerStore((state) => state.osd)
  const preview = usePlayerStore((state) => state.preview)
  const drawing = useAnnotationStore((state) => state.drawing)
  const frameIndex = useFrameClock().index
  // MP4, MKV, MOV and WebM load right away; whether what is inside plays is known a moment later.
  const playFile = !sourcePath ? null : standIn?.source === sourcePath ? standIn.file : opensDirectly(sourcePath) ? sourcePath : null

  /** Asks for the converted copy and loads it at the same spot. `hide`: nothing of the file itself can show meanwhile. */
  const convert = useCallback((source: string, reencode: boolean, hide: boolean): void => {
    const player = usePlayerStore.getState
    const request: Conversion = { source, reencode, running: true }
    conversion.current = request
    if (hide) setStandIn({ source, file: null })
    setError(null)
    setConverting(0)
    api.media
      .playableFile(source, reencode)
      .then((file) => {
        if (conversion.current !== request) return
        // The copy starts where the file was (a seek still waiting for the first load stays as it is).
        if (!player().pendingSeek) player().setPendingSeek({ time: player().currentTime, play: player().playing })
        setStandIn({ source, file })
        void useMediaStore.getState().ensureFrameIndex(source, file)
      })
      .catch((reason: unknown) => {
        if (conversion.current !== request) return
        console.warn(`[Clipea2] conversion failed: ${reason instanceof Error ? reason.message : String(reason)}`)
        setError(getT().player.cantPlay)
      })
      .finally(() => {
        if (conversion.current !== request) return
        request.running = false
        setConverting(null)
      })
  }, [])

  useEffect(() => {
    conversion.current = null
    setStandIn(null)
    setConverting(null)
    setError(null)
    if (!sourcePath) return
    const current = (): boolean => usePlayerStore.getState().sourcePath === sourcePath
    const media = useMediaStore.getState()
    media
      .ensureInfo(sourcePath)
      .then((info) => {
        if (!current() || conversion.current) return
        const plan = playbackPlan(info)
        if (plan === 'direct') return void media.ensureFrameIndex(sourcePath)
        // A file that only lacks its sound keeps playing while the copy is made.
        convert(sourcePath, false, plan.video === 'encode' || !opensDirectly(sourcePath))
      })
      .catch((reason: unknown) => {
        if (current()) setError(reason instanceof Error ? reason.message : String(reason))
      })
  }, [sourcePath, convert])

  useEffect(
    () =>
      api.media.onConversionProgress(({ path, fraction }) => {
        if (conversion.current?.running && conversion.current.source === path) setConverting(fraction)
      }),
    []
  )

  // React only drops the attribute: without this the element keeps (and keeps playing) the video before.
  useEffect(() => {
    if (!playFile) videoRef.current?.load()
  }, [playFile])

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
      lastFrameTime = time
      if (pendingTarget === null) player().setTime(time)
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

    /** The file on screen does not play: go for its converted copy, unless that is what just failed. */
    const retryConverted = (path: string): boolean => {
      const asked = conversion.current?.source === path ? conversion.current : null
      // Its copy is already on the way.
      if (asked?.running) return true
      if (asked?.reencode) return false
      convert(path, true, true)
      return true
    }

    /** Sound and no picture: Chromium opened the file but has no decoder for its video (a file with sound only is fine). */
    const checkPicture = (): void => {
      const path = player().sourcePath
      if (video.videoWidth || !path) return
      void useMediaStore
        .getState()
        .ensureInfo(path)
        .then((info) => {
          if (!info.video || player().sourcePath !== path || video.videoWidth) return
          if (!retryConverted(path)) setError(getT().player.cantPlay)
        })
        .catch(() => undefined)
    }

    const onLoaded = (): void => {
      checkPicture()
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
      console.warn(`[Clipea2] video error (${failure?.code ?? '?'}): ${failure?.message ?? 'no details'}`)
      const now = performance.now()
      if (canRecover(failure?.code, recoveries, now)) {
        recoveries = [...recoveries, now]
        // The file is fine, the decoder is not: reload it and come back to the same frame.
        player().setPendingSeek({ time: queuedSeek ?? pendingTarget ?? player().currentTime, play: player().playing })
        video.load()
        return
      }
      if (needsConversion(failure?.code) && retryConverted(path)) return
      setError(getT().player.cantPlay)
    }

    const controller: PlayerController = {
      play: () => void video.play().catch(() => undefined),
      pause: () => video.pause(),
      togglePlay: () => (video.paused ? controller.play() : controller.pause()),
      seek: (time) => {
        const end = Number.isFinite(video.duration) ? video.duration : getFrameClock().duration
        const target = clamp(time, 0, end)
        // Until it lands, the frames still showing up are from earlier targets: dragging along the
        // timeline, they would pull the playhead back on every move.
        pendingTarget = target
        seekTo(target)
        player().setTime(target)
      },
      seekBy: (delta) => controller.seek((queuedSeek ?? pendingTarget ?? video.currentTime) + delta),
      stepFrame: (delta) => {
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
      ['seeked', onSeeked],
      ['timeupdate', onTimeUpdate],
      ['play', onPlay],
      ['pause', onPause],
      ['ended', onEnded],
      ['error', onError],
      // Nothing loaded (a copy is being made): the drawing layer has no picture to sit on.
      ['emptied', measure]
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
      player().setController(null)
    }
  }, [convert])

  const previewItem = preview ? preview.items[preview.index] : null

  return (
    <div className={styles.stageWrap}>
      {drawing && sourcePath ? <DrawingToolbar /> : null}
      <div
        ref={stageRef}
        className={styles.stage}
        onClick={() => !drawing && sourcePath && usePlayerStore.getState().controller?.togglePlay()}
        // Like the timeline and the play button: wheel up steps one frame forward, down one back.
        onWheel={(event) => {
          if (sourcePath && !event.ctrlKey && event.deltaY !== 0) usePlayerStore.getState().controller?.stepFrame(event.deltaY < 0 ? 1 : -1)
        }}
      >
        <video ref={videoRef} className={styles.video} src={playFile ? toMediaUrl(playFile) : undefined} preload="auto" hidden={!playFile} />

        {!sourcePath ? (
          <div className={styles.placeholder}>
            <img src={logo} alt="" width={84} height={84} />
            <p className={styles.placeholderTitle}>
              {t.player.pickClip[0]}
              <span>{t.player.pickClip[1]}</span>
            </p>
            <p className={styles.placeholderBody}>
              {t.player.dropHint[0]}
              <Kbd>I</Kbd>
              {t.player.dropHint[1]}
              <Kbd>O</Kbd>
              {t.player.dropHint[2]}
            </p>
          </div>
        ) : null}

        {rect && sourcePath ? <PlayerOverlay rect={rect} sourcePath={sourcePath} /> : null}

        <SpeedOsd osd={osd} />

        <div className={styles.badges}>
          {previewItem && preview ? (
            <div className={styles.previewBadge} onClick={(event) => event.stopPropagation()}>
              <Clapperboard size={14} />
              {t.player.previewing(preview.index + 1, preview.items.length)}
              <Button size="sm" variant="ghost" icon={<Square size={12} />} onClick={() => usePlayerStore.getState().stopPreview()}>
                {t.player.stop}
              </Button>
            </div>
          ) : null}
        </div>

        {error ? (
          <div className={styles.error} role="alert">
            <CircleAlert size={18} /> {error}
          </div>
        ) : converting !== null ? (
          <div className={styles.notice} role="status">
            <LoaderCircle size={18} /> {t.player.converting(Math.round(converting * 100))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
