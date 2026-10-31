import { getT } from '@shared/i18n'
import { createHash } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { MediaProber } from '../application/ports'
import { mediaInfoFromFfprobe, type FfprobeOutput, type MediaInfo } from '../domain/mediaInfo'
import { readMp4Movie, type Mp4Movie } from './mp4Reader'
import { runProcess } from './processRunner'
import { TaskQueue } from './taskQueue'

/** Probes kept in memory; the library alone can ask for thousands. */
const MAX_CACHED = 500
/** MP4 indexes kept for the frame table that usually follows a probe (a long recording's is ~1.4 MB). */
const MAX_MOVIES = 4
/** Reading every packet of a multi-GB recording takes a while, but never this long. */
const FRAME_TIMES_TIMEOUT_MS = 180_000

const fingerprintOf = async (path: string): Promise<string> => {
  const info = await stat(path)
  return `${info.size}|${info.mtimeMs}`
}

/**
 * MP4/MOV files (every ShadowPlay recording) are read in-process from their index; other
 * containers, or MP4s with unusual layouts, go through ffprobe.
 */
export class FfprobeMediaProber implements MediaProber {
  private readonly cache = new Map<string, { fingerprint: string; info: Promise<MediaInfo> }>()
  private readonly movies = new Map<string, Promise<{ movie: Mp4Movie; sizeBytes: number } | null>>()
  private readonly frameJobs = new Map<string, Promise<number[]>>()
  /** Scrolling the library must not start one ffprobe per row at once. */
  private readonly queue = new TaskQueue(4)

  /** `frameCacheDir`: where ffprobe frame tables are kept between runs (reading them costs a full pass over the file). */
  constructor(
    private readonly ffprobePath: () => Promise<string>,
    private readonly frameCacheDir: string | null = null
  ) {}

  async probe(path: string): Promise<MediaInfo> {
    const fingerprint = await fingerprintOf(path).catch(() => '')
    const cached = this.cache.get(path)
    if (cached && cached.fingerprint === fingerprint) {
      // Refresh its position so the least recently used probe is the one evicted.
      this.cache.delete(path)
      this.cache.set(path, cached)
      return cached.info
    }
    const info = this.readInfo(path, fingerprint)
    this.cache.set(path, { fingerprint, info })
    info.catch(() => {
      if (this.cache.get(path)?.info === info) this.cache.delete(path)
    })
    while (this.cache.size > MAX_CACHED) {
      const oldest = this.cache.keys().next().value
      if (oldest === undefined) break
      this.cache.delete(oldest)
    }
    return info
  }

  frameTimes(path: string): Promise<number[]> {
    const pending = this.frameJobs.get(path)
    if (pending) return pending
    const job = this.readFrameTimes(path).finally(() => this.frameJobs.delete(path))
    this.frameJobs.set(path, job)
    return job
  }

  private async readInfo(path: string, fingerprint: string): Promise<MediaInfo> {
    const mp4 = await this.movie(path, fingerprint)
    if (mp4) return { path, sizeBytes: mp4.sizeBytes, ...mp4.movie.info }
    return this.queue.run(() => this.ffprobeInfo(path))
  }

  private async readFrameTimes(path: string): Promise<number[]> {
    const fingerprint = await fingerprintOf(path)
    const mp4 = await this.movie(path, fingerprint)
    if (mp4) return Array.from(mp4.movie.frameTimes)
    return this.ffprobeFrameTimesCached(path, fingerprint)
  }

  /** Shared by the probe and the frame table asked right after it: the index is read once. */
  private movie(path: string, fingerprint: string): Promise<{ movie: Mp4Movie; sizeBytes: number } | null> {
    const key = `${path}|${fingerprint}`
    let read = this.movies.get(key)
    if (read) {
      this.movies.delete(key)
    } else {
      read = readMp4Movie(path).catch(() => null)
    }
    this.movies.set(key, read)
    while (this.movies.size > MAX_MOVIES) {
      const oldest = this.movies.keys().next().value
      if (oldest === undefined) break
      this.movies.delete(oldest)
    }
    return read
  }

  private async ffprobeFrameTimesCached(path: string, fingerprint: string): Promise<number[]> {
    if (!this.frameCacheDir) return this.ffprobeFrameTimes(path)
    const key = createHash('sha1').update(`${path}|${fingerprint}`).digest('hex').slice(0, 16)
    const file = join(this.frameCacheDir, `frames-${key}.bin`)
    const stored = await readFile(file).catch(() => null)
    if (stored && stored.byteLength > 0 && stored.byteLength % 8 === 0) {
      return Array.from(new Float64Array(stored.buffer, stored.byteOffset, stored.byteLength / 8))
    }
    const times = await this.ffprobeFrameTimes(path)
    if (times.length > 0) {
      await mkdir(this.frameCacheDir, { recursive: true })
      await writeFile(file, Buffer.from(Float64Array.from(times).buffer)).catch(() => undefined)
    }
    return times
  }

  private async ffprobeFrameTimes(path: string): Promise<number[]> {
    const args = ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=pts_time', '-of', 'csv=p=0', path]
    const { stdout, stderr, code } = await runProcess(await this.ffprobePath(), args, { timeoutMs: FRAME_TIMES_TIMEOUT_MS })
    if (code !== 0) throw new Error(stderr.trim() || getT().media.probeFailed(code))
    return stdout
      .split(/\r?\n/)
      .map((line) => Number.parseFloat(line))
      .filter((value) => Number.isFinite(value))
  }

  private async ffprobeInfo(path: string): Promise<MediaInfo> {
    const args = ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path]
    const { stdout, stderr, code } = await runProcess(await this.ffprobePath(), args, { timeoutMs: 30_000, priority: 'background' })
    if (code !== 0) throw new Error(stderr.trim() || getT().media.probeFailed(code))
    return mediaInfoFromFfprobe(path, JSON.parse(stdout) as FfprobeOutput)
  }
}
