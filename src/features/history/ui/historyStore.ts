import { create } from 'zustand'
import { api } from '@shared/ui/api'
import { keepUnchanged, type HistoryEntry } from '../domain/exportRecord'

interface HistoryState {
  entries: HistoryEntry[]
  loaded: boolean
  /** Re-reads the history and checks which files still exist. */
  refresh(): Promise<void>
  remove(id: string): Promise<void>
  clear(): Promise<void>
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  entries: [],
  loaded: false,
  async refresh() {
    const entries = keepUnchanged(get().entries, await api.history.list())
    const same = entries.length === get().entries.length && entries.every((entry, index) => entry === get().entries[index])
    set(same ? { loaded: true } : { entries, loaded: true })
  },
  async remove(id) {
    set({ entries: keepUnchanged(get().entries, await api.history.remove(id)) })
  },
  async clear() {
    set({ entries: await api.history.clear() })
  }
}))
