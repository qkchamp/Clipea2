import { exceedsLimit } from '../domain/discordLimits'
import { MIN_VIDEO_KBPS, nextVideoKbps } from '../domain/encodingPlan'
import type { OutputFiles, RenderProgress, RenderSpec, VideoRenderer } from './ports'

export const MAX_ATTEMPTS = 3

export interface ExportEvents {
  progress(attempt: number, progress: RenderProgress): void
  /** The file came out over the limit and is being encoded again with less bitrate. */
  retry(info: { attempt: number; previousBytes: number; videoKbps: number }): void
}

export interface ExportOutcome {
  path: string
  sizeBytes: number
  fits: boolean
  attempts: number
  videoKbps: number
}

/** Ways to render the same spec, fastest first: GPU decode + encode, GPU encode only, all on the CPU. */
export function fallbackLadder(spec: RenderSpec, cpuCanEncode: boolean): RenderSpec[] {
  const ladder = [spec]
  if (spec.hwDecode !== null) ladder.push({ ...spec, hwDecode: null })
  if (spec.output.gpu !== null && cpuCanEncode) ladder.push({ ...spec, hwDecode: null, output: { ...spec.output, gpu: null } })
  return ladder
}

/**
 * A GPU can pass the startup check and still fail on a real clip (old driver, out of NVENC
 * sessions, a recording its decoder does not handle). The export steps down the ladder instead of
 * failing; later attempts of the same export start from the step that worked.
 */
export function withHardwareFallback(renderer: VideoRenderer, cpuCanEncode: boolean, onFallback: (error: unknown) => void): VideoRenderer {
  let level = 0
  return {
    async render(spec, onProgress, signal) {
      const ladder = fallbackLadder(spec, cpuCanEncode)
      for (;;) {
        try {
          return await renderer.render(ladder[Math.min(level, ladder.length - 1)], onProgress, signal)
        } catch (error) {
          if (signal.aborted || level >= ladder.length - 1) throw error
          level++
          onFallback(error)
        }
      }
    }
  }
}

/**
 * Encodes and checks the real size against the limit. NVENC lands close to the target but not
 * exactly, so an oversized file is re-encoded with proportionally less video bitrate.
 */
export async function exportClip(
  deps: { renderer: VideoRenderer; files: OutputFiles },
  spec: RenderSpec,
  sizeLimitBytes: number | null,
  events: ExportEvents,
  signal: AbortSignal
): Promise<ExportOutcome> {
  let videoKbps = spec.output.videoKbps
  for (let attempt = 1; ; attempt++) {
    const attemptSpec: RenderSpec = { ...spec, output: { ...spec.output, videoKbps } }
    try {
      await deps.renderer.render(attemptSpec, (progress) => events.progress(attempt, progress), signal)
    } catch (error) {
      await deps.files.remove(spec.output.path).catch(() => undefined)
      throw error
    }

    const sizeBytes = await deps.files.sizeOf(spec.output.path)
    const fits = !exceedsLimit(sizeBytes, sizeLimitBytes)
    const outOfOptions = attempt >= MAX_ATTEMPTS || videoKbps <= MIN_VIDEO_KBPS
    if (fits || sizeLimitBytes === null || outOfOptions) {
      return { path: spec.output.path, sizeBytes, fits, attempts: attempt, videoKbps }
    }

    videoKbps = nextVideoKbps(videoKbps, sizeBytes, sizeLimitBytes, spec.output.audioKbps, spec.timeline.totalDuration)
    events.retry({ attempt: attempt + 1, previousBytes: sizeBytes, videoKbps })
  }
}
