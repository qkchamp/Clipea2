import { formatBytes, formatDuration } from '@shared/domain/time'
import { api } from '@shared/ui/api'
import { groupSameTimes, isAnimated, shapeOnFrame, type Annotation } from '@features/annotations/domain/annotation'
import { rasterizeShapes } from '@features/annotations/ui/rasterize'
import { useAnnotationStore } from '@features/annotations/ui/annotationStore'
import { reexportName, type HistoryEntry } from '@features/history/domain/exportRecord'
import { baseName, recordingLabel } from '@features/library/domain/libraryClip'
import { useMediaStore } from '@features/media/ui/mediaStore'
import { useMontageStore } from '@features/montage/ui/montageStore'
import { useSettingsStore } from '@features/settings/ui/settingsStore'
import { currentSelection } from '@features/trimming/ui/trimActions'
import { canEncode } from '../domain/encoderSupport'
import {
  defaultFileName,
  preferencesFrom,
  resolveExportTarget,
  sourceSummary,
  uniqueSources,
  type ExportTarget
} from './exportTarget'
import { useExportStore } from './exportStore'
import { computePlanning } from './useExportPlan'

const CODEC_NAMES = { hevc: 'H.265', h264: 'H.264', av1: 'AV1' } as const

interface ExportInput {
  target: ExportTarget
  annotations: readonly Annotation[]
  fileName: string
  /** Human label of each segment's recording, kept in the history. */
  labels: readonly string[]
  /** File chosen in the save dialog; re-exports leave it out and get a free name in the export folder. */
  outputPath?: string
}

/** Shared by the editor export and "Exportar otra vez" from the history; uses the current export options. */
async function runExport({ target, annotations, fileName, labels, outputPath }: ExportInput): Promise<void> {
  const exportStore = useExportStore.getState()
  if (exportStore.job.status === 'running' || exportStore.job.status === 'preparing') return
  const { settings } = useSettingsStore.getState()
  if (!settings) return

  exportStore.setJob({ status: 'preparing', label: fileName })
  try {
    // Right after start-up the GPU check may still be running: wait for it instead of guessing.
    const ffmpeg = await useSettingsStore.getState().ensureEncoders()
    if (!ffmpeg.found || !ffmpeg.encoders) throw new Error('No encontré ffmpeg: instalalo (winget install Gyan.FFmpeg) o elegilo en Ajustes.')
    if (!canEncode(ffmpeg.encoders, settings.codec, settings.hardwareAcceleration)) {
      throw new Error(`Tu ffmpeg no puede codificar ${CODEC_NAMES[settings.codec]}. Elegí otro códec.`)
    }

    const sources = uniqueSources(target)
    const infos = await Promise.all(sources.map((path) => useMediaStore.getState().ensureInfo(path)))
    const summary = sourceSummary(sources, Object.fromEntries(infos.map((info) => [info.path, info])))
    if (!summary) throw new Error('Alguno de los videos no tiene imagen.')

    const drawn = annotations.filter((annotation) => sources.includes(annotation.sourcePath))
    const { plan, preferences } = computePlanning(target, summary, preferencesFrom(settings))
    if (!plan.fits && preferences.sizeLimitBytes !== null) {
      throw new Error(
        `No entra en ${formatBytes(preferences.sizeLimitBytes)} ni bajando la calidad. ` +
          `Recortá a menos de ${formatDuration(plan.maxDurationAtAll ?? 0)} o elegí «Sin límite».`
      )
    }

    // Drawings with the same times travel as one image: a scribble of 20 strokes is one overlay, not 20.
    // An animated drawing goes alone, drawn where it was drawn, and ffmpeg slides it along its keyframes.
    const rendered = await Promise.all(
      groupSameTimes(drawn).map(async (group) => {
        const [first] = group
        const animated = isAnimated(first)
        return {
          id: first.id,
          sourcePath: first.sourcePath,
          start: first.start,
          end: first.end,
          motion: animated ? first.keyframes : undefined,
          png: await rasterizeShapes(
            group.map((annotation) => (animated ? annotation.shape : shapeOnFrame(annotation, annotation.start))),
            plan.width,
            plan.height
          )
        }
      })
    )

    const { jobId } = await api.exporter.start({
      segments: target.segments,
      annotations: rendered,
      output: {
        width: plan.width,
        height: plan.height,
        fps: plan.fps,
        codec: plan.codec,
        cq: plan.cq,
        videoKbps: plan.videoKbps,
        audioKbps: plan.audioKbps
      },
      sizeLimitBytes: preferences.sizeLimitBytes,
      hardwareAcceleration: settings.hardwareAcceleration,
      outputDir: settings.outputDir,
      fileName,
      outputPath,
      record: {
        segments: target.segments.map((segment, index) => ({
          ...segment,
          sourceLabel: labels[index] ?? recordingLabel(segment.sourcePath)
        })),
        annotations: drawn,
        estimatedMaxBytes: plan.estimatedMaxBytes
      }
    })
    if (useExportStore.getState().job.status === 'preparing') {
      useExportStore.getState().setJob({ status: 'running', jobId, label: fileName, attempt: 1, fraction: 0, speed: null, note: null })
    }
  } catch (error) {
    useExportStore.getState().setJob({ status: 'error', message: error instanceof Error ? error.message : String(error) })
  }
}

/**
 * "Exportar a disco" (button or Ctrl+E): the montage, or the selection when the montage is empty.
 * First asks where to save it, starting in the export folder with the suggested name.
 */
export async function startExport(): Promise<void> {
  const job = useExportStore.getState().job
  const { settings } = useSettingsStore.getState()
  if (job.status === 'running' || job.status === 'preparing' || !settings) return
  const montage = useMontageStore.getState().segments
  const target = resolveExportTarget(montage, currentSelection())
  if (!target) return
  const outputPath = await api.system.chooseExportPath(settings.outputDir, useExportStore.getState().fileName.trim() || defaultFileName(target))
  if (!outputPath) return
  await runExport({
    target,
    annotations: useAnnotationStore.getState().annotations,
    fileName: baseName(outputPath).replace(/\.mp4$/i, ''),
    outputPath,
    labels: target.kind === 'montage' ? montage.map((segment) => segment.sourceLabel) : target.segments.map((s) => recordingLabel(s.sourcePath))
  })
}

/** Same cuts and drawings as a previous export, with the export options chosen now. */
export function reexport(entry: HistoryEntry): Promise<void> {
  return runExport({
    target: {
      kind: entry.segments.length > 1 ? 'montage' : 'selection',
      segments: entry.segments.map(({ sourcePath, start, end }) => ({ sourcePath, start, end }))
    },
    annotations: entry.annotations,
    fileName: reexportName(entry),
    labels: entry.segments.map((segment) => segment.sourceLabel)
  })
}

export function cancelExport(): void {
  const job = useExportStore.getState().job
  if (job.status === 'running') void api.exporter.cancel(job.jobId)
}
