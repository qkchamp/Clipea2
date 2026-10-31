import { getT } from '@shared/i18n'
import { baseName, describeRecording } from '@features/library/domain/libraryClip'
import type { MediaInfo } from '@features/media/domain/mediaInfo'
import type { Segment } from '@features/montage/domain/montage'
import type { AppSettings } from '@features/settings/domain/settings'
import { isValidRange, type TimeRange } from '@features/trimming/domain/timeRange'
import { megabytesToBytes } from '../domain/discordLimits'
import type { EncodingPreferences, SourceVideoSummary } from '../domain/encodingPlan'
import type { RenderSegmentInput } from '../domain/renderTimeline'

export interface ExportTarget {
  kind: 'montage' | 'selection'
  segments: RenderSegmentInput[]
}

/** The montage if it has segments; otherwise the in/out selection of the video on screen. */
export function resolveExportTarget(
  montage: readonly Segment[],
  selection: { sourcePath: string; range: TimeRange } | null
): ExportTarget | null {
  if (montage.length > 0) {
    return {
      kind: 'montage',
      segments: montage.map(({ sourcePath, start, end }) => ({ sourcePath, start, end }))
    }
  }
  if (selection && isValidRange(selection.range)) {
    return { kind: 'selection', segments: [{ sourcePath: selection.sourcePath, ...selection.range }] }
  }
  return null
}

export function uniqueSources(target: ExportTarget): string[] {
  return [...new Set(target.segments.map((segment) => segment.sourcePath))]
}

/** The biggest source decides the output size; null while some source is still being probed. */
export function sourceSummary(paths: readonly string[], infos: Readonly<Record<string, MediaInfo>>): SourceVideoSummary | null {
  const videos = paths.map((path) => infos[path]?.video)
  if (videos.length === 0 || videos.some((video) => !video)) return null
  const biggest = videos.reduce((best, video) => (video!.height * video!.fps > best!.height * best!.fps ? video : best))!
  return { width: biggest.width, height: biggest.height, fps: biggest.fps, codec: biggest.codec, videoKbps: biggest.bitrateKbps }
}

export function preferencesFrom(settings: AppSettings): EncodingPreferences {
  return {
    codec: settings.codec,
    quality: settings.quality,
    maxHeight: settings.maxHeight,
    maxFps: settings.maxFps,
    audioKbps: settings.audioKbps,
    sizeLimitBytes: settings.sizeLimitMb === null ? null : megabytesToBytes(settings.sizeLimitMb)
  }
}

const pad = (value: number): string => String(value).padStart(2, '0')

/** "How To Fish 2026-10-03 07.42" (or "Montaje …", "Montage …" in English, when it mixes games). */
export function defaultFileName(target: ExportTarget, now = new Date()): string {
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}.${pad(now.getMinutes())}`
  const titles = new Set(uniqueSources(target).map((path) => describeRecording(baseName(path)).title))
  const [onlyTitle] = [...titles]
  return titles.size === 1 && onlyTitle ? `${onlyTitle} ${stamp}` : `${getT().export.montageName} ${stamp}`
}
