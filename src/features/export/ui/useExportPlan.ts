import { useEffect, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useMediaStore } from '@features/media/ui/mediaStore'
import { useMontageStore } from '@features/montage/ui/montageStore'
import { usePlayerStore } from '@features/player/ui/playerStore'
import { useSettingsStore } from '@features/settings/ui/settingsStore'
import { useTrimStore } from '@features/trimming/ui/trimStore'
import type { EncodingPlan, EncodingPreferences, SourceVideoSummary } from '../domain/encodingPlan'
import { planEncoding } from '../domain/encodingPlan'
import { preferencesFrom, resolveExportTarget, sourceSummary, uniqueSources, type ExportTarget } from './exportTarget'

export interface ExportPlanning {
  target: ExportTarget
  plan: EncodingPlan
  preferences: EncodingPreferences
  /** Output length: every cut back to back. */
  durationSec: number
}

/** Same computation for the panel preview and for the export itself. */
export function computePlanning(
  target: ExportTarget,
  summary: SourceVideoSummary,
  preferences: EncodingPreferences
): ExportPlanning {
  const durationSec = target.segments.reduce((total, segment) => total + (segment.end - segment.start), 0)
  return { target, preferences, plan: planEncoding(durationSec, summary, preferences), durationSec }
}

export function useExportPlan(): { target: ExportTarget | null; planning: ExportPlanning | null } {
  const montage = useMontageStore((state) => state.segments)
  const sourcePath = usePlayerStore((state) => state.sourcePath)
  const range = useTrimStore((state) => state.range)
  const rangeSource = useTrimStore((state) => state.rangeSource)
  const settings = useSettingsStore((state) => state.settings)

  const target = useMemo(
    () => resolveExportTarget(montage, sourcePath && range && rangeSource === sourcePath ? { sourcePath, range } : null),
    [montage, sourcePath, range, rangeSource]
  )
  const sources = useMemo(() => (target ? uniqueSources(target) : []), [target])
  // Only the probes of what gets exported: the library probing its rows must not recompute this.
  const sourceInfos = useMediaStore(useShallow((state) => sources.map((path) => state.infos[path])))

  useEffect(() => {
    // Cached per path, so re-running while handles are dragged costs nothing.
    for (const path of sources) void useMediaStore.getState().ensureInfo(path).catch(() => undefined)
  }, [sources])

  const planning = useMemo(() => {
    if (!target || !settings) return null
    const infos = Object.fromEntries(sources.flatMap((path, index) => (sourceInfos[index] ? [[path, sourceInfos[index]]] : [])))
    const summary = sourceSummary(sources, infos)
    return summary ? computePlanning(target, summary, preferencesFrom(settings)) : null
  }, [target, settings, sources, sourceInfos])

  return { target, planning }
}
