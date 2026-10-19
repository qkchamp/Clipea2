import { randomUUID } from 'node:crypto'
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { ExportRecord } from '@features/history/domain/exportRecord'
import type { MediaProber } from '@features/media/application/ports'
import type { ExportEvent, ExportRequest } from '@shared/contracts/clipea2Api'
import { exportClip, withHardwareFallback } from '../application/exportClip'
import type { OutputFiles, RenderSpec, VideoRenderer } from '../application/ports'
import { decodingGpu, gpuFor, type EncoderSupport } from '../domain/encoderSupport'
import { compileRenderTimeline } from '../domain/renderTimeline'
import { partialOutputPath, uniqueOutputPath } from './outputNaming'

const nodeOutputFiles: OutputFiles = {
  sizeOf: async (path) => (await stat(path)).size,
  remove: (path) => rm(path, { force: true })
}

/** How long quitting waits for cancelled exports to clean up their files. */
const CANCEL_WAIT_MS = 5000

interface Dependencies {
  renderer: VideoRenderer
  prober: MediaProber
  encoders: () => Promise<EncoderSupport>
  emit: (event: ExportEvent) => void
  /** Keeps the finished export in the history. */
  recordExport: (record: ExportRecord) => Promise<void>
  tempRoot: string
}

/** Runs exports in the background and reports through events; one AbortController per job. */
export class ExportJobRunner {
  private readonly jobs = new Map<string, { controller: AbortController; done: Promise<void> }>()

  constructor(private readonly deps: Dependencies) {}

  start(request: ExportRequest): string {
    const jobId = randomUUID()
    const controller = new AbortController()
    const done = this.run(jobId, request, controller.signal).finally(() => this.jobs.delete(jobId))
    this.jobs.set(jobId, { controller, done })
    return jobId
  }

  get running(): boolean {
    return this.jobs.size > 0
  }

  cancel(jobId: string): void {
    this.jobs.get(jobId)?.controller.abort()
  }

  /** Cancels everything and waits (bounded) until the partial files are gone. */
  async cancelAll(): Promise<void> {
    const pending = [...this.jobs.values()]
    for (const job of pending) job.controller.abort()
    if (pending.length === 0) return
    await Promise.race([
      Promise.allSettled(pending.map((job) => job.done)),
      new Promise((resolve) => setTimeout(resolve, CANCEL_WAIT_MS))
    ])
  }

  private async run(jobId: string, request: ExportRequest, signal: AbortSignal): Promise<void> {
    const startedAt = Date.now()
    const tempDir = join(this.deps.tempRoot, jobId)
    const outputDir = request.outputPath ? dirname(request.outputPath) : request.outputDir
    const workingPath = partialOutputPath(outputDir, request.fileName, jobId)
    try {
      await mkdir(outputDir, { recursive: true })
      await mkdir(tempDir, { recursive: true })

      const timeline = compileRenderTimeline(request.segments, request.annotations, 1 / request.output.fps)
      const shown = new Set(timeline.overlays.map((window) => window.annotationId))
      const overlays: RenderSpec['overlays'] = []
      for (const annotation of request.annotations.filter((a) => shown.has(a.id))) {
        const pngPath = join(tempDir, `${annotation.id}.png`)
        await writeFile(pngPath, annotation.png)
        overlays.push({ annotationId: annotation.id, pngPath })
      }

      const sources = [...new Set(request.segments.map((segment) => segment.sourcePath))]
      const infos = await Promise.all(sources.map((path) => this.deps.prober.probe(path)))
      const audioTracks = Object.fromEntries(infos.map((info) => [info.path, info.audio.length]))
      const encoders = await this.deps.encoders()

      const spec: RenderSpec = {
        timeline,
        audioTracks,
        overlays,
        hwDecode: decodingGpu(encoders, request.hardwareAcceleration),
        output: {
          ...request.output,
          path: workingPath,
          gpu: gpuFor(encoders, request.output.codec, request.hardwareAcceleration)
        }
      }
      // The fallback may move the encode to the CPU: the history keeps where it really happened.
      let encodedOn = spec.output.gpu
      const tracked: VideoRenderer = {
        render: async (attempt, onProgress, attemptSignal) => {
          await this.deps.renderer.render(attempt, onProgress, attemptSignal)
          encodedOn = attempt.output.gpu
        }
      }
      const renderer = withHardwareFallback(tracked, encoders.cpu[request.output.codec], (error) =>
        this.deps.emit({ jobId, type: 'fallback', reason: error instanceof Error ? error.message : String(error) })
      )

      const outcome = await exportClip(
        { renderer, files: nodeOutputFiles },
        spec,
        request.sizeLimitBytes,
        {
          progress: (attempt, progress) =>
            this.deps.emit({ jobId, type: 'progress', attempt, fraction: progress.fraction, speed: progress.speed }),
          retry: (info) => this.deps.emit({ jobId, type: 'retry', ...info })
        },
        signal
      )
      if (signal.aborted) throw new Error('cancelado')
      // Only a finished file gets the real name: a crash or a cancel never leaves a broken clip behind.
      const finalPath = request.outputPath ?? uniqueOutputPath(request.outputDir, request.fileName)
      await rename(workingPath, finalPath)

      const record: ExportRecord = {
        ...request.record,
        id: randomUUID(),
        path: finalPath,
        createdAt: Date.now(),
        sizeBytes: outcome.sizeBytes,
        sizeLimitBytes: request.sizeLimitBytes,
        fits: outcome.fits,
        attempts: outcome.attempts,
        durationSec: timeline.totalDuration,
        renderSec: (Date.now() - startedAt) / 1000,
        video: {
          width: request.output.width,
          height: request.output.height,
          fps: request.output.fps,
          codec: request.output.codec,
          kbps: outcome.videoKbps,
          gpu: encodedOn
        }
      }
      // The file is done either way; a history write failure must not turn it into an error.
      await this.deps.recordExport(record).catch(() => undefined)
      this.deps.emit({
        jobId,
        type: 'done',
        path: finalPath,
        sizeBytes: outcome.sizeBytes,
        fits: outcome.fits,
        attempts: outcome.attempts,
        sizeLimitBytes: request.sizeLimitBytes,
        recordId: record.id
      })
    } catch (error) {
      await rm(workingPath, { force: true }).catch(() => undefined)
      if (signal.aborted) this.deps.emit({ jobId, type: 'cancelled' })
      else this.deps.emit({ jobId, type: 'error', message: error instanceof Error ? error.message : String(error) })
    } finally {
      await rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
    }
  }
}
