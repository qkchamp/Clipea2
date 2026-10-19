import { create } from 'zustand'
import type { FfmpegStatus } from '@shared/contracts/clipea2Api'
import { api } from '@shared/ui/api'
import type { AppSettings } from '../domain/settings'

interface SettingsState {
  settings: AppSettings | null
  ffmpeg: FfmpegStatus | null
  load(): Promise<void>
  update(patch: Partial<AppSettings>): Promise<void>
  refreshFfmpeg(): Promise<void>
  /** ffmpeg status with the NVENC check finished (waits for it if needed). */
  ensureEncoders(): Promise<FfmpegStatus>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  ffmpeg: null,
  async load() {
    set({ settings: await api.settings.get() })
    // First answer right away (is ffmpeg there?), then again once the GPU check is done.
    set({ ffmpeg: await api.system.ffmpegStatus(false) })
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
  async refreshFfmpeg() {
    set({ ffmpeg: await api.system.ffmpegStatus(true) })
  },
  async ensureEncoders() {
    const current = get().ffmpeg
    if (current?.encoders) return current
    const status = await api.system.ffmpegStatus(true)
    set({ ffmpeg: status })
    return status
  }
}))
