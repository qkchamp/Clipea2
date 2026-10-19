import { create } from 'zustand'
import { createId } from '@shared/domain/id'
import {
  appendSegment,
  moveSegment,
  removeSegment,
  updateSegmentRange,
  type Segment
} from '../domain/montage'

interface MontageState {
  segments: Segment[]
  add(segment: Omit<Segment, 'id'>): Segment
  remove(id: string): void
  move(from: number, to: number): void
  updateRange(id: string, start: number, end: number): void
  clear(): void
  replaceAll(segments: Segment[]): void
}

export const useMontageStore = create<MontageState>((set, get) => ({
  segments: [],
  add(segment) {
    const created: Segment = { ...segment, id: createId() }
    set({ segments: [...appendSegment(get().segments, created)] })
    return created
  },
  remove: (id) => set({ segments: [...removeSegment(get().segments, id)] }),
  move: (from, to) => set({ segments: [...moveSegment(get().segments, from, to)] }),
  updateRange: (id, start, end) => set({ segments: [...updateSegmentRange(get().segments, id, start, end)] }),
  clear: () => set({ segments: [] }),
  replaceAll: (segments) => set({ segments })
}))
