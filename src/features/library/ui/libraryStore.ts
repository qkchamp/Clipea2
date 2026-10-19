import { create } from 'zustand'
import { api } from '@shared/ui/api'
import type { GameFolder, LibraryScan } from '../domain/libraryClip'

interface LibraryState {
  /** One scan per library folder, in the order of the settings. */
  scans: LibraryScan[] | null
  loading: boolean
  error: string | null
  query: string
  expanded: Record<string, boolean>
  /** Library folders start open; this remembers the ones closed by hand. */
  collapsedRoots: Record<string, boolean>
  /** `quiet`: background refresh (folder changed); keeps the list on screen without a spinner. */
  load(roots: readonly string[], options?: { quiet?: boolean }): Promise<void>
  /** A watched folder changed: only that one is read again. */
  refresh(root: string): Promise<void>
  setQuery(query: string): void
  toggle(folderPath: string): void
  toggleRoot(root: string): void
}

/** Only the newest scan may land: a slow old one must not overwrite a newer result. */
let latestRequest = 0

export const useLibraryStore = create<LibraryState>((set, get) => ({
  scans: null,
  loading: false,
  error: null,
  query: '',
  expanded: {},
  collapsedRoots: {},

  async load(roots, options = {}) {
    const request = ++latestRequest
    if (!options.quiet) set({ loading: true, error: null })
    try {
      const scans = await Promise.all(roots.map((root) => api.library.scan(root)))
      if (request !== latestRequest) return
      // First load: open the most recent game.
      const latest = scans
        .flatMap((scan) => scan.games)
        .reduce<GameFolder | null>((best, game) => (!best || game.latestMs > best.latestMs ? game : best), null)
      const expanded = Object.keys(get().expanded).length > 0 || !latest ? get().expanded : { [latest.path]: true }
      set({ scans, expanded, loading: false, error: null })
    } catch (error) {
      if (request !== latestRequest) return
      set({ loading: false, error: error instanceof Error ? error.message : String(error) })
    }
  },

  async refresh(root) {
    if (!get().scans?.some((scan) => scan.root === root)) return
    try {
      const scan = await api.library.scan(root)
      set((state) => ({ scans: state.scans?.map((existing) => (existing.root === root ? scan : existing)) ?? null }))
    } catch {
      // The next change, or the refresh button, tries again.
    }
  },

  setQuery: (query) => set({ query }),
  toggle: (folderPath) => set((state) => ({ expanded: { ...state.expanded, [folderPath]: !state.expanded[folderPath] } })),
  toggleRoot: (root) => set((state) => ({ collapsedRoots: { ...state.collapsedRoots, [root]: !state.collapsedRoots[root] } }))
}))
