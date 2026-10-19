import { create } from 'zustand'
import { api } from '@shared/ui/api'
import type { HistoryEntry } from '../domain/exportRecord'

interface HistoryState {
  entries: HistoryEntry[]
  loaded: boolean
  /** Re-reads the history and checks which files still exist. */
  refresh(): Promise<void>
  remove(id: string): Promise<void>
  clear(): Promise<void>
}

export const useHistoryStore = create<HistoryState>((set) => ({
  entries: [],
  loaded: false,
  async refresh() {
    set({ entries: await api.history.list(), loaded: true })
  },
  async remove(id) {
    set({ entries: await api.history.remove(id) })
  },
  async clear() {
    set({ entries: await api.history.clear() })
  }
}))
