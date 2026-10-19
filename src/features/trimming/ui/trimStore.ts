import { create } from 'zustand'
import { fullRange, shiftRange, withEnd, withStart, type TimeRange } from '../domain/timeRange'

/** Videos whose in/out selection is remembered while the app is open. */
const MAX_REMEMBERED = 50

interface TrimState {
  /** In/out selection (whole video by default, like HandBrake). */
  range: TimeRange | null
  /** Video the selection belongs to. */
  rangeSource: string | null
  /** Montage segment being edited in the timeline, if any. */
  editingSegmentId: string | null
  /** Last selection of each video, so going back to one keeps what was marked. */
  remembered: Record<string, TimeRange>
  reset(sourcePath: string, duration: number): void
  setRange(range: TimeRange): void
  markIn(time: number, duration: number): void
  markOut(time: number, duration: number): void
  shift(delta: number, duration: number): void
  editSegment(id: string, sourcePath: string, range: TimeRange): void
  stopEditing(): void
}

function remember(remembered: Record<string, TimeRange>, source: string | null, range: TimeRange | null): Record<string, TimeRange> {
  if (!source || !range) return remembered
  // Re-inserting moves it to the end, so the oldest selections are the ones dropped.
  const others = { ...remembered }
  delete others[source]
  const entries = Object.entries({ ...others, [source]: range })
  return Object.fromEntries(entries.slice(-MAX_REMEMBERED))
}

/** A stored selection only applies if it still fits the video (it may have been replaced). */
const fits = (range: TimeRange | undefined, duration: number): range is TimeRange =>
  range !== undefined && range.end <= duration + 1e-3 && range.start >= 0 && range.end > range.start

export const useTrimStore = create<TrimState>((set, get) => ({
  range: null,
  rangeSource: null,
  editingSegmentId: null,
  remembered: {},
  reset: (rangeSource, duration) => {
    const { range, rangeSource: previousSource, remembered } = get()
    const stored = remembered[rangeSource]
    set({
      range: fits(stored, duration) ? stored : fullRange(duration),
      rangeSource,
      editingSegmentId: null,
      // Editing a montage segment borrows the selection: that range is not the video's own.
      remembered: get().editingSegmentId ? remembered : remember(remembered, previousSource, range)
    })
  },
  setRange: (range) => set({ range }),
  markIn: (time, duration) => set({ range: withStart(get().range ?? fullRange(duration), time, duration) }),
  markOut: (time, duration) => set({ range: withEnd(get().range ?? fullRange(duration), time, duration) }),
  shift: (delta, duration) => {
    const range = get().range
    if (range) set({ range: shiftRange(range, delta, duration) })
  },
  editSegment: (editingSegmentId, rangeSource, range) => {
    const { range: previous, rangeSource: previousSource, remembered, editingSegmentId: wasEditing } = get()
    set({
      editingSegmentId,
      rangeSource,
      range,
      remembered: wasEditing ? remembered : remember(remembered, previousSource, previous)
    })
  },
  stopEditing: () => set({ editingSegmentId: null })
}))
