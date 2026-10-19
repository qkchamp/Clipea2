import { createHash } from 'node:crypto'
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileExists as exists } from '@shared/infrastructure/fileExists'
import type { MediaProber, Thumbnailer } from '../application/ports'
import { runProcess } from './processRunner'
import { TaskQueue } from './taskQueue'

const hash = (text: string): string => createHash('sha1').update(text).digest('hex').slice(0, 16)

/** Written once a filmstrip finished: ffmpeg may produce one frame less than asked, so the count cannot tell. */
const STRIP_DONE = 'done'
/**
 * Up to this length one pass decoding every keyframe is quickest (~0.3 s for a minute). Longer
 * recordings seek straight to each frame instead: a 97-minute one went from 23 s to ~1.2 s.
 */
const KEYFRAME_PASS_MAX_SEC = 150
/** ffmpeg processes sharing the seeks of a long filmstrip. */
const STRIP_WORKERS = 4

export interface CacheLimits {
  maxBytes: number
  maxAgeMs: number
}

export const DEFAULT_CACHE_LIMITS: CacheLimits = { maxBytes: 500 * 1024 * 1024, maxAgeMs: 60 * 24 * 60 * 60 * 1000 }

export class FfmpegThumbnailer implements Thumbnailer {
  private readonly queue = new TaskQueue(3)
  private readonly inFlight = new Map<string, Promise<string>>()
  private readonly stripsInFlight = new Map<string, Promise<string[]>>()

  constructor(
    private readonly ffmpegPath: () => Promise<string>,
    private readonly prober: MediaProber,
    private readonly cacheDir: string
  ) {}

  async thumbnail(videoPath: string, atSec?: number): Promise<string> {
    const key = await this.cacheKey(videoPath, atSec === undefined ? 'auto' : atSec.toFixed(2))
    const output = join(this.cacheDir, `${key}.jpg`)
    const pending = this.inFlight.get(output)
    if (pending) return pending
    if (await exists(output)) return output

    const job = this.queue
      .run(async () => {
        const info = await this.prober.probe(videoPath)
        const seconds = Math.max(0, Math.min(atSec ?? info.durationSec * 0.4, info.durationSec - 0.2))
        await mkdir(this.cacheDir, { recursive: true })
        // A library preview does not need an exact frame: the nearest keyframe decodes alone.
        const seek = atSec === undefined ? ['-noaccurate_seek', '-skip_frame', 'nokey'] : []
        const args = ['-hide_banner', '-loglevel', 'error', ...seek, '-ss', seconds.toFixed(3), '-i', videoPath]
        const result = await runProcess(
          await this.ffmpegPath(),
          [...args, '-frames:v', '1', '-vf', 'scale=320:-2', '-q:v', '4', '-y', output],
          { priority: 'background' }
        )
        if (result.code !== 0 || !(await exists(output))) throw new Error(result.stderr.trim() || 'No se pudo generar la miniatura')
        return output
      })
      .finally(() => this.inFlight.delete(output))
    this.inFlight.set(output, job)
    return job
  }

  /** `count` evenly spaced frames for the timeline; it jumps the queue because the user is looking at it. */
  async filmstrip(videoPath: string, count: number): Promise<string[]> {
    const key = await this.cacheKey(videoPath, `strip${count}`)
    const dir = join(this.cacheDir, `strip-${key}`)
    if (await exists(join(dir, STRIP_DONE))) {
      const cached = await this.listFrames(dir)
      if (cached.length > 0) return cached
    }
    const pending = this.stripsInFlight.get(dir)
    if (pending) return pending

    const job = this.queue
      .run(async () => {
        const info = await this.prober.probe(videoPath)
        // A strip cut short (app closed mid-way) must not mix with the new frames.
        await rm(dir, { recursive: true, force: true })
        await mkdir(dir, { recursive: true })
        const ffmpeg = await this.ffmpegPath()
        if (info.durationSec <= KEYFRAME_PASS_MAX_SEC) await this.keyframePass(ffmpeg, videoPath, info.durationSec, count, dir)
        else await this.seekPass(ffmpeg, videoPath, info.durationSec, count, dir)
        const frames = await this.listFrames(dir)
        if (frames.length > 0) await writeFile(join(dir, STRIP_DONE), String(frames.length))
        return frames
      }, { urgent: true })
      .finally(() => this.stripsInFlight.delete(dir))
    this.stripsInFlight.set(dir, job)
    return job
  }

  /** One pass over the file decoding keyframes only. */
  private async keyframePass(ffmpeg: string, videoPath: string, durationSec: number, count: number, dir: string): Promise<void> {
    const rate = (count / Math.max(durationSec, 0.5)).toFixed(6)
    const args = ['-hide_banner', '-loglevel', 'error', '-skip_frame', 'nokey', '-i', videoPath]
    const result = await runProcess(ffmpeg, [...args, '-vf', `fps=${rate},scale=-2:90`, '-frames:v', String(count), '-q:v', '5', '-y', join(dir, 'f%03d.jpg')])
    if (result.code !== 0) throw new Error(result.stderr.trim() || 'No se pudo generar la tira de miniaturas')
  }

  /** One seek per frame (nearest keyframe, nothing else decoded), split across a few ffmpeg processes. */
  private async seekPass(ffmpeg: string, videoPath: string, durationSec: number, count: number, dir: string): Promise<void> {
    const frames = Array.from({ length: count }, (_, index) => ({ index, at: (durationSec * (index + 0.5)) / count }))
    const perWorker = Math.ceil(count / STRIP_WORKERS)
    const chunks = Array.from({ length: STRIP_WORKERS }, (_, worker) => frames.slice(worker * perWorker, (worker + 1) * perWorker))
    const results = await Promise.all(
      chunks
        .filter((chunk) => chunk.length > 0)
        .map((chunk) => {
          const inputs = chunk.flatMap(({ at }) => ['-noaccurate_seek', '-skip_frame', 'nokey', '-ss', at.toFixed(3), '-i', videoPath])
          const outputs = chunk.flatMap(({ index }, input) => [
            '-map', `${input}:v:0`, '-frames:v', '1', '-vf', 'scale=-2:90', '-q:v', '5', '-y',
            join(dir, `f${String(index + 1).padStart(3, '0')}.jpg`)
          ])
          return runProcess(ffmpeg, ['-hide_banner', '-loglevel', 'error', ...inputs, ...outputs])
        })
    )
    const failed = results.find((result) => result.code !== 0)
    if (failed) throw new Error(failed.stderr.trim() || 'No se pudo generar la tira de miniaturas')
  }

  /** Drops previews older than `maxAgeMs`, then the oldest ones until the cache fits in `maxBytes`. */
  async prune(limits: CacheLimits = DEFAULT_CACHE_LIMITS, now = Date.now()): Promise<void> {
    const entries = await readdir(this.cacheDir, { withFileTypes: true }).catch(() => [])
    const items: Array<{ path: string; bytes: number; mtimeMs: number }> = []
    for (const entry of entries) {
      const path = join(this.cacheDir, entry.name)
      const info = await stat(path).catch(() => null)
      if (!info) continue
      let bytes = info.size
      if (entry.isDirectory()) {
        const files = await readdir(path).catch(() => [] as string[])
        const sizes = await Promise.all(files.map((file) => stat(join(path, file)).then((s) => s.size, () => 0)))
        bytes = sizes.reduce((total, size) => total + size, 0)
      }
      items.push({ path, bytes, mtimeMs: info.mtimeMs })
    }
    items.sort((a, b) => a.mtimeMs - b.mtimeMs)
    let total = items.reduce((sum, item) => sum + item.bytes, 0)
    for (const item of items) {
      if (now - item.mtimeMs <= limits.maxAgeMs && total <= limits.maxBytes) break
      await rm(item.path, { recursive: true, force: true }).catch(() => undefined)
      total -= item.bytes
    }
  }

  private async cacheKey(videoPath: string, variant: string): Promise<string> {
    const info = await stat(videoPath)
    return hash(`${videoPath}|${info.size}|${info.mtimeMs}|${variant}`)
  }

  private async listFrames(dir: string): Promise<string[]> {
    const files = await readdir(dir).catch(() => [] as string[])
    return files
      .filter((file) => file.endsWith('.jpg'))
      .sort()
      .map((file) => join(dir, file))
  }
}
