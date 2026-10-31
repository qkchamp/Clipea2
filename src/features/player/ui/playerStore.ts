import { create } from 'zustand'
import { clamp } from '@shared/domain/time'
import { getT } from '@shared/i18n'
import { formatPlaybackRate, PLAYBACK_RATE, stepPlaybackRate } from '../domain/playbackRate'

/** Imperative handle registered by the <video> container; other features drive playback through it. */
export interface PlayerController {
  play(): void
  pause(): void
  togglePlay(): void
  seek(time: number): void
  seekBy(delta: number): void
  stepFrame(delta: number): void
}

export interface PendingSeek {
  time: number
  play: boolean
}

/** Sequential playback of montage segments ("Ver montaje"). */
export interface PreviewQueue {
  items: Array<{ id?: string; sourcePath: string; start: number; end: number }>
  index: number
}

interface PlayerState {
  sourcePath: string | null
  /** Media time of the frame on screen. */
  currentTime: number
  duration: number
  playing: boolean
  rate: number
  volume: number
  muted: boolean
  osd: { text: string; id: number } | null
  pendingSeek: PendingSeek | null
  controller: PlayerController | null
  preview: PreviewQueue | null

  open(path: string, seek?: PendingSeek): void
  setController(controller: PlayerController | null): void
  setTime(time: number): void
  setDuration(duration: number): void
  setPlaying(playing: boolean): void
  setRate(rate: number): void
  stepRate(direction: 1 | -1): void
  resetRate(): void
  setVolume(volume: number): void
  setMuted(muted: boolean): void
  toggleMute(): void
  showOsd(text: string): void
  takePendingSeek(): PendingSeek | null
  /** Where to land once the current file (re)loads. */
  setPendingSeek(seek: PendingSeek): void
  startPreview(queue: PreviewQueue['items']): void
  advancePreview(): void
  stopPreview(): void
}

let osdCounter = 0

export const usePlayerStore = create<PlayerState>((set, get) => ({
  sourcePath: null,
  currentTime: 0,
  duration: 0,
  playing: false,
  rate: PLAYBACK_RATE.normal,
  volume: 1,
  muted: false,
  osd: null,
  pendingSeek: null,
  controller: null,
  preview: null,

  open(path, seek) {
    const { sourcePath, controller } = get()
    if (path === sourcePath && controller) {
      if (seek) {
        controller.seek(seek.time)
        if (seek.play) controller.play()
      }
      return
    }
    set({ sourcePath: path, currentTime: seek?.time ?? 0, duration: 0, playing: false, pendingSeek: seek ?? null })
  },

  setController: (controller) => set({ controller }),
  setTime: (currentTime) => set({ currentTime }),
  setDuration: (duration) => set({ duration }),
  setPlaying: (playing) => set({ playing }),

  setRate(rate) {
    const next = clamp(rate, PLAYBACK_RATE.min, PLAYBACK_RATE.max)
    set({ rate: next })
    get().showOsd(getT().player.speedOsd(formatPlaybackRate(next)))
  },

  stepRate(direction) {
    const rate = stepPlaybackRate(get().rate, direction)
    set({ rate })
    get().showOsd(getT().player.speedOsd(formatPlaybackRate(rate)))
  },

  resetRate() {
    set({ rate: PLAYBACK_RATE.normal })
    get().showOsd(getT().player.speedOsd(formatPlaybackRate(PLAYBACK_RATE.normal)))
  },

  setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)), muted: false }),
  setMuted: (muted) => set({ muted }),
  toggleMute: () => set((state) => ({ muted: !state.muted })),
  showOsd: (text) => set({ osd: { text, id: ++osdCounter } }),

  takePendingSeek() {
    const pending = get().pendingSeek
    if (pending) set({ pendingSeek: null })
    return pending
  },

  setPendingSeek: (pendingSeek) => set({ pendingSeek }),

  startPreview(items) {
    if (items.length === 0) return
    set({ preview: { items, index: 0 } })
    const first = items[0]
    get().open(first.sourcePath, { time: first.start, play: true })
  },

  advancePreview() {
    const preview = get().preview
    if (!preview) return
    const index = preview.index + 1
    const next = preview.items[index]
    if (!next) {
      set({ preview: null })
      get().controller?.pause()
      return
    }
    set({ preview: { ...preview, index } })
    get().open(next.sourcePath, { time: next.start, play: true })
  },

  // Every seek of the timeline calls it: without a montage playing, it doesn't wake up the store.
  stopPreview: () => get().preview && set({ preview: null })
}))
