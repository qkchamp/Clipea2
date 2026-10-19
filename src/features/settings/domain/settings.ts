import type { QualityLevel, VideoCodec } from '@features/export/domain/encodingPlan'

export interface AppSettings {
  /** Folders where ShadowPlay saves recordings (one subfolder per game); the library shows them all together. */
  libraryRoots: string[]
  outputDir: string
  /** Folder holding ffmpeg.exe and ffprobe.exe; null = find it automatically. */
  ffmpegDir: string | null
  /** Encode and decode on the GPU (dedicated or integrated) when there is one. */
  hardwareAcceleration: boolean
  codec: VideoCodec
  quality: QualityLevel
  maxHeight: number | null
  maxFps: number | null
  audioKbps: number
  /** null = no limit. */
  sizeLimitMb: number | null
}

const CODECS: readonly VideoCodec[] = ['hevc', 'h264', 'av1']
const QUALITIES: readonly QualityLevel[] = ['max', 'high', 'light']

const positiveOrNull = (value: unknown, fallback: number | null): number | null => {
  if (value === null) return null
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

const text = (value: unknown, fallback: string): string => (typeof value === 'string' && value.trim() !== '' ? value : fallback)

const folders = (value: unknown, fallback: string[]): string[] =>
  Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string' && item.trim() !== ''))] : fallback

/** Applies a patch keeping every field valid; unknown or broken values fall back to the current ones. */
export function mergeSettings(current: AppSettings, patch: Record<string, unknown>): AppSettings {
  const has = (key: keyof AppSettings): boolean => Object.prototype.hasOwnProperty.call(patch, key)
  // Settings saved before the library took several folders had a single `libraryRoot`.
  const legacyRoot = text(patch.libraryRoot, '')
  return {
    libraryRoots: has('libraryRoots')
      ? folders(patch.libraryRoots, current.libraryRoots)
      : legacyRoot !== ''
        ? [legacyRoot]
        : current.libraryRoots,
    outputDir: has('outputDir') ? text(patch.outputDir, current.outputDir) : current.outputDir,
    ffmpegDir: has('ffmpegDir')
      ? typeof patch.ffmpegDir === 'string' && patch.ffmpegDir.trim() !== ''
        ? patch.ffmpegDir
        : null
      : current.ffmpegDir,
    hardwareAcceleration: typeof patch.hardwareAcceleration === 'boolean' ? patch.hardwareAcceleration : current.hardwareAcceleration,
    codec: CODECS.includes(patch.codec as VideoCodec) ? (patch.codec as VideoCodec) : current.codec,
    quality: QUALITIES.includes(patch.quality as QualityLevel) ? (patch.quality as QualityLevel) : current.quality,
    maxHeight: has('maxHeight') ? positiveOrNull(patch.maxHeight, current.maxHeight) : current.maxHeight,
    maxFps: has('maxFps') ? positiveOrNull(patch.maxFps, current.maxFps) : current.maxFps,
    audioKbps: has('audioKbps') ? (positiveOrNull(patch.audioKbps, current.audioKbps) ?? current.audioKbps) : current.audioKbps,
    sizeLimitMb: has('sizeLimitMb') ? positiveOrNull(patch.sizeLimitMb, current.sizeLimitMb) : current.sizeLimitMb
  }
}
