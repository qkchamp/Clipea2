import { createHash } from 'node:crypto'
import { mkdir, readdir, rename, rm, stat, utimes } from 'node:fs/promises'
import { join } from 'node:path'
import type { GpuVendor } from '@features/export/domain/encoderSupport'
import type { MediaProber } from '@features/media/application/ports'
import type { MediaInfo } from '@features/media/domain/mediaInfo'
import { pruneCacheDir, type CacheLimits } from '@features/media/infrastructure/cachePruning'
import { runProcess } from '@features/media/infrastructure/processRunner'
import { fileExists as exists } from '@shared/infrastructure/fileExists'
import { getT } from '@shared/i18n'
import type { PlayableFiles } from '../application/ports'
import { fullConversion, planKey, playbackPlan, type ConversionPlan, type ConversionProgress } from '../domain/playbackPlan'
import { conversionArgs } from './conversionCommand'

/** Converted copies are as big as the videos: fewer and for less time than the previews. */
export const PLAYBACK_CACHE_LIMITS: CacheLimits = { maxBytes: 8 * 1024 * 1024 * 1024, maxAgeMs: 14 * 24 * 60 * 60 * 1000 }

/** A copy being written; it gets its final name only once it is whole. */
const PARTIAL = '.partial'

interface Dependencies {
  ffmpegPath: () => Promise<string>
  prober: MediaProber
  /** GPU that encodes H.264 on this machine, or null for the CPU. */
  gpu: () => Promise<GpuVendor | null>
  cacheDir: string
  emit: (progress: ConversionProgress) => void
}

interface Job {
  output: string
  file: Promise<string>
  abort: AbortController
}

const isAbort = (error: unknown): boolean => error instanceof Error && error.name === 'AbortError'

/**
 * Makes with ffmpeg, once, an MP4 the player can load for the videos Chromium does not play. The
 * streams it already plays are copied; only the rest is encoded.
 */
export class FfmpegPlaybackConverter implements PlayableFiles {
  /** One conversion at a time: the one for the clip just opened replaces the one still running. */
  private job: Job | null = null
  /** Questions still being answered: asking twice for the same video never starts two ffmpeg on one file. */
  private readonly asked = new Map<string, Promise<string>>()

  constructor(private readonly deps: Dependencies) {}

  playableFile(path: string, reencode = false): Promise<string> {
    const key = `${reencode}|${path}`
    const pending = this.asked.get(key)
    if (pending) return pending
    const answer = this.find(path, reencode).finally(() => this.asked.delete(key))
    this.asked.set(key, answer)
    return answer
  }

  private async find(path: string, reencode: boolean): Promise<string> {
    const info = await this.deps.prober.probe(path)
    const plan = reencode ? fullConversion(info) : playbackPlan(info)
    if (plan === 'direct') return path
    if (!info.video) throw new Error(getT().player.cantPlay)

    const output = join(this.deps.cacheDir, `${await this.cacheKey(path, plan)}.mp4`)
    if (this.job?.output === output) return this.job.file
    if (await exists(output)) {
      // Used again: it moves to the end of the line of copies to drop.
      const now = new Date()
      await utimes(output, now, now).catch(() => undefined)
      return output
    }

    this.job?.abort.abort()
    const abort = new AbortController()
    const file = this.convert(info, plan, output, abort.signal)
      // A stream that would not go into the MP4 as it is: encode everything instead.
      .catch((error: unknown) => {
        if (isAbort(error) || planKey(plan) === planKey(fullConversion(info))) throw error
        return this.convert(info, fullConversion(info), output, abort.signal)
      })
      .finally(() => {
        if (this.job?.output === output) this.job = null
      })
    this.job = { output, file, abort }
    void file.then(() => this.prune(output)).catch(() => undefined)
    return file
  }

  /** Drops the copies not watched for a while, and the ones cut short when the app closed mid-way. */
  async prune(keep: string | null = null): Promise<void> {
    const running = this.job ? `${this.job.output}${PARTIAL}` : null
    const files = await readdir(this.deps.cacheDir).catch(() => [] as string[])
    for (const name of files) {
      const path = join(this.deps.cacheDir, name)
      if (name.endsWith(PARTIAL) && path !== running) await rm(path, { force: true }).catch(() => undefined)
    }
    await pruneCacheDir(this.deps.cacheDir, PLAYBACK_CACHE_LIMITS, Date.now(), keep)
  }

  /** Stops the conversion in progress and waits until its file is gone; run before quitting. */
  async shutdown(): Promise<void> {
    const job = this.job
    if (!job) return
    job.abort.abort()
    await job.file.catch(() => undefined)
  }

  private async convert(info: MediaInfo, plan: ConversionPlan, output: string, signal: AbortSignal): Promise<string> {
    const partial = `${output}${PARTIAL}`
    const gpu = plan.video === 'encode' ? await this.deps.gpu().catch(() => null) : null
    // A GPU encoder can refuse a size or a driver: the CPU always encodes.
    const encoders = gpu ? [gpu, null] : [null]
    await mkdir(this.deps.cacheDir, { recursive: true })
    try {
      for (const [attempt, encoder] of encoders.entries()) {
        const args = conversionArgs({ input: info.path, output: partial, plan, gpu: encoder, fps: info.video?.fps ?? 30 })
        const result = await runProcess(await this.deps.ffmpegPath(), args, {
          signal,
          priority: 'background',
          onStdoutLine: (line) => this.report(info, line)
        })
        if (result.code === 0 && (await exists(partial))) {
          await rename(partial, output)
          return output
        }
        if (attempt === encoders.length - 1) throw new Error(result.stderr.trim().split(/\r?\n/).slice(-2).join(' · ') || getT().player.cantPlay)
      }
      throw new Error(getT().player.cantPlay)
    } catch (error) {
      await rm(partial, { force: true }).catch(() => undefined)
      throw error
    }
  }

  /** ffmpeg -progress lines: "out_time_us=1234567". */
  private report(info: MediaInfo, line: string): void {
    if (!line.startsWith('out_time_us=') || info.durationSec <= 0) return
    const micros = Number(line.slice('out_time_us='.length))
    if (!Number.isFinite(micros) || micros < 0) return
    this.deps.emit({ path: info.path, fraction: Math.min(1, micros / 1e6 / info.durationSec) })
  }

  private async cacheKey(path: string, plan: ConversionPlan): Promise<string> {
    const info = await stat(path)
    return createHash('sha1').update(`${path}|${info.size}|${info.mtimeMs}|${planKey(plan)}`).digest('hex').slice(0, 16)
  }
}
