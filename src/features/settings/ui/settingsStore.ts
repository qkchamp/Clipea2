import { create } from 'zustand'
import { isNewerRelease, type FfmpegInstallProgress } from '@features/media/domain/ffmpegRelease'
import type { FfmpegStatus } from '@shared/contracts/clipea2Api'
import { getLanguage, isLanguage, setLanguage, type Language } from '@shared/i18n'
import { api } from '@shared/ui/api'
import { ipcErrorMessage } from '@shared/ui/ipcError'
import type { AppSettings } from '../domain/settings'

/** What the ffmpeg box in Ajustes is doing right now. */
export type FfmpegTask =
  | { kind: 'checking' }
  | { kind: 'installing'; progress: FfmpegInstallProgress | null }
  | { kind: 'error'; message: string; retry: 'check' | 'install' }

interface SettingsState {
  settings: AppSettings | null
  ffmpeg: FfmpegStatus | null
  /** Latest ffmpeg release Clipea2 can install, once asked for. */
  ffmpegLatest: string | null
  ffmpegTask: FfmpegTask | null
  load(): Promise<void>
  update(patch: Partial<AppSettings>): Promise<void>
  /** Asks for a folder and adds it to the library. The one picked (new or already there), or null if cancelled. */
  addLibraryRoot(): Promise<string | null>
  refreshFfmpeg(): Promise<void>
  /** ffmpeg status with the NVENC check finished (waits for it if needed). */
  ensureEncoders(): Promise<FfmpegStatus>
  /** `quiet`: the check on start, which says nothing if there's no internet. */
  checkFfmpegUpdate(options?: { quiet?: boolean }): Promise<void>
  /** One click: downloads ffmpeg, installs it for Clipea2 and starts using it. */
  installFfmpeg(): Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  ffmpeg: null,
  ffmpegLatest: null,
  ffmpegTask: null,
  async load() {
    set({ settings: await api.settings.get() })
    // First answer right away (is ffmpeg there?), then again once the GPU check is done.
    set({ ffmpeg: await api.system.ffmpegStatus(false) })
    // On start, look once for a newer ffmpeg so Ajustes can say the one in use is old.
    if (get().ffmpeg?.found) void get().checkFfmpegUpdate({ quiet: true })
    set({ ffmpeg: await api.system.ffmpegStatus(true) })
  },
  async update(patch) {
    const previous = get().settings
    set({ settings: previous ? { ...previous, ...patch } : previous })
    try {
      set({ settings: await api.settings.update(patch) })
    } catch (error) {
      set({ settings: previous })
      throw error
    }
    if ('ffmpegDir' in patch) {
      set({ ffmpeg: await api.system.ffmpegStatus(false) })
      set({ ffmpeg: await api.system.ffmpegStatus(true) })
    }
  },
  async addLibraryRoot() {
    const before = get().settings?.libraryRoots ?? []
    const folder = await api.system.chooseFolder(before[before.length - 1])
    // Read again: the list may have changed while the dialog was open.
    const roots = get().settings?.libraryRoots ?? []
    if (folder && !roots.includes(folder)) await get().update({ libraryRoots: [...roots, folder] })
    return folder
  },
  async refreshFfmpeg() {
    set({ ffmpeg: await api.system.ffmpegStatus(true) })
  },
  async ensureEncoders() {
    const current = get().ffmpeg
    if (current?.encoders) return current
    const status = await api.system.ffmpegStatus(true)
    set({ ffmpeg: status })
    return status
  },
  async checkFfmpegUpdate({ quiet = false } = {}) {
    if (!quiet) set({ ffmpegTask: { kind: 'checking' } })
    try {
      const latest = await api.system.ffmpegLatest()
      set(quiet ? { ffmpegLatest: latest } : { ffmpegLatest: latest, ffmpegTask: null })
    } catch (error) {
      if (!quiet) set({ ffmpegTask: { kind: 'error', message: ipcErrorMessage(error), retry: 'check' } })
    }
  },
  async installFfmpeg() {
    if (get().ffmpegTask?.kind === 'installing') return
    set({ ffmpegTask: { kind: 'installing', progress: null } })
    const stop = api.system.onFfmpegInstallProgress((progress) => set({ ffmpegTask: { kind: 'installing', progress } }))
    try {
      const status = await api.system.installFfmpeg()
      set({ ffmpeg: status, ffmpegLatest: status.version, ffmpegTask: null, settings: await api.settings.get() })
      // The GPU check of the new ffmpeg runs in the background; the badges fill in when it ends.
      set({ ffmpeg: await api.system.ffmpegStatus(true) })
    } catch (error) {
      set({ ffmpegTask: { kind: 'error', message: ipcErrorMessage(error), retry: 'install' } })
    } finally {
      stop()
    }
  }
}))

const LANGUAGE_KEY = 'clipea2.language'

function speak(language: Language): void {
  setLanguage(language)
  document.documentElement.lang = language
  if (localStorage.getItem(LANGUAGE_KEY) !== language) localStorage.setItem(LANGUAGE_KEY, language)
}

/**
 * The window speaks the language of the settings, live. It is also kept in localStorage, so the first
 * frame of the next start already shows it, before the settings arrive.
 */
export function followLanguageSetting(): void {
  const saved = localStorage.getItem(LANGUAGE_KEY)
  speak(isLanguage(saved) ? saved : getLanguage())
  useSettingsStore.subscribe((state) => {
    const language = state.settings?.language
    if (language) speak(language)
  })
}

/** True when the ffmpeg in use is an older release than the one Clipea2 can install. */
export function ffmpegOutdated(state: Pick<SettingsState, 'ffmpeg' | 'ffmpegLatest'>): boolean {
  return Boolean(state.ffmpeg?.found && state.ffmpegLatest && isNewerRelease(state.ffmpegLatest, state.ffmpeg.version))
}
