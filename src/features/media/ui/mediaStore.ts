import { create } from 'zustand'
import { api } from '@shared/ui/api'
import { FrameIndex } from '../domain/frameIndex'
import type { MediaInfo } from '../domain/mediaInfo'

interface MediaState {
  infos: Record<string, MediaInfo>
  frameIndexes: Record<string, FrameIndex | null>
  ensureInfo(path: string): Promise<MediaInfo>
  /**
   * `playedFrom`: the converted copy on screen when the video itself does not play. Its frames are the
   * ones stepped through, so the table is read from it (asking again with another file replaces it).
   */
  ensureFrameIndex(path: string, playedFrom?: string): Promise<FrameIndex | null>
}

/** Frame tables kept in memory (a long recording's is ~1.4 MB); older ones are read again if reopened. */
const MAX_FRAME_INDEXES = 8

const pendingInfo = new Map<string, Promise<MediaInfo>>()
const pendingIndex = new Map<string, Promise<FrameIndex | null>>()
/** The file each video's frame table is read from: the last one asked for wins. */
const framesFrom = new Map<string, string>()

/** Cache of probe results shared by every feature of the UI. */
export const useMediaStore = create<MediaState>((set, get) => ({
  infos: {},
  frameIndexes: {},

  ensureInfo(path) {
    const known = get().infos[path]
    if (known) return Promise.resolve(known)
    let pending = pendingInfo.get(path)
    if (!pending) {
      pending = api.media
        .probe(path)
        .then((info) => {
          set((state) => ({ infos: { ...state.infos, [path]: info } }))
          return info
        })
        .finally(() => pendingInfo.delete(path))
      pendingInfo.set(path, pending)
    }
    return pending
  },

  ensureFrameIndex(path, playedFrom = path) {
    const known = framesFrom.get(path) === playedFrom
    framesFrom.set(path, playedFrom)
    if (known && path in get().frameIndexes) return Promise.resolve(get().frameIndexes[path])
    const key = `${path}|${playedFrom}`
    let pending = pendingIndex.get(key)
    if (!pending) {
      pending = Promise.all([get().ensureInfo(path), api.media.frameTimes(playedFrom)])
        .then(([info, times]) => {
          // The <video> clock is the one of the file it loads: in a copy the sound may start a moment
          // before the first frame, and that frame is not at zero.
          const startTime = playedFrom === path ? (info.video?.startTime ?? 0) : 0
          return FrameIndex.fromTimestamps(times, startTime, info.video?.fps ?? 30)
        })
        .catch(() => null)
        .then((index) => {
          // A slower table of the file played before must not replace the one of the copy on screen.
          if (framesFrom.get(path) !== playedFrom) return get().frameIndexes[path] ?? null
          set((state) => {
            const others = Object.entries(state.frameIndexes).filter(([key]) => key !== path)
            return { frameIndexes: Object.fromEntries([...others.slice(-(MAX_FRAME_INDEXES - 1)), [path, index]]) }
          })
          return index
        })
        .finally(() => pendingIndex.delete(key))
      pendingIndex.set(key, pending)
    }
    return pending
  }
}))
