import { create } from 'zustand'
import { api } from '@shared/ui/api'
import { FrameIndex } from '../domain/frameIndex'
import type { MediaInfo } from '../domain/mediaInfo'

interface MediaState {
  infos: Record<string, MediaInfo>
  frameIndexes: Record<string, FrameIndex | null>
  ensureInfo(path: string): Promise<MediaInfo>
  ensureFrameIndex(path: string): Promise<FrameIndex | null>
}

/** Frame tables kept in memory (a long recording's is ~1.4 MB); older ones are read again if reopened. */
const MAX_FRAME_INDEXES = 8

const pendingInfo = new Map<string, Promise<MediaInfo>>()
const pendingIndex = new Map<string, Promise<FrameIndex | null>>()

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

  ensureFrameIndex(path) {
    if (path in get().frameIndexes) return Promise.resolve(get().frameIndexes[path])
    let pending = pendingIndex.get(path)
    if (!pending) {
      pending = Promise.all([get().ensureInfo(path), api.media.frameTimes(path)])
        .then(([info, times]) => FrameIndex.fromTimestamps(times, info.video?.startTime ?? 0, info.video?.fps ?? 30))
        .catch(() => null)
        .then((index) => {
          set((state) => {
            const others = Object.entries(state.frameIndexes).filter(([key]) => key !== path)
            return { frameIndexes: Object.fromEntries([...others.slice(-(MAX_FRAME_INDEXES - 1)), [path, index]]) }
          })
          return index
        })
        .finally(() => pendingIndex.delete(path))
      pendingIndex.set(path, pending)
    }
    return pending
  }
}))
