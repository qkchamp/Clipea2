import { open } from 'node:fs/promises'
import { extname } from 'node:path'
import { pickFps, type AudioStreamInfo, type MediaInfo, type VideoStreamInfo } from '../domain/mediaInfo'

/**
 * Reads what Clipea2 needs straight from the MP4/MOV index (the "moov" box): no ffprobe process
 * and no pass over the video data. A 97-minute ShadowPlay recording takes milliseconds instead of
 * the ~7 s ffprobe needs to list its 175,000 frames. Anything unusual returns null and goes to ffprobe.
 */

const MP4_EXTENSIONS = new Set(['.mp4', '.m4v', '.mov'])
/** Long recordings carry a few MB of index; past this the file is not worth holding in memory. */
const MAX_MOOV_BYTES = 256 * 1024 * 1024

const VIDEO_CODECS: Record<string, string> = { avc1: 'h264', avc3: 'h264', hvc1: 'hevc', hev1: 'hevc', av01: 'av1', vp09: 'vp9' }
const AUDIO_CODECS: Record<string, string> = { mp4a: 'aac', Opus: 'opus', 'ac-3': 'ac3', 'ec-3': 'eac3', fLaC: 'flac' }

/** Nominal rates players and recorders use; ShadowPlay is VFR around one of them. */
const INTEGER_RATES = [24, 25, 30, 48, 50, 60, 72, 90, 100, 120, 144, 165, 240]
const NTSC_RATES = [24000 / 1001, 30000 / 1001, 60000 / 1001, 120000 / 1001]

export interface Mp4Movie {
  info: Omit<MediaInfo, 'path' | 'sizeBytes'>
  /** Presentation time of every video frame in seconds, in decode order (what ffprobe lists as packet pts_time). */
  frameTimes: Float64Array
}

interface Box {
  type: string
  start: number
  end: number
  /** Where the payload starts (after the 8 or 16 byte header). */
  body: number
}

function* boxes(buf: Buffer, from: number, to: number): Generator<Box> {
  let at = from
  while (at + 8 <= to) {
    let size = buf.readUInt32BE(at)
    const type = buf.toString('latin1', at + 4, at + 8)
    let header = 8
    if (size === 1) {
      if (at + 16 > to) return
      size = Number(buf.readBigUInt64BE(at + 8))
      header = 16
    } else if (size === 0) {
      size = to - at
    }
    if (size < header || at + size > to) return
    yield { type, start: at, end: at + size, body: at + header }
    at += size
  }
}

function child(buf: Buffer, parent: Box, type: string): Box | null {
  for (const box of boxes(buf, parent.body, parent.end)) if (box.type === type) return box
  return null
}

function descend(buf: Buffer, parent: Box, ...types: string[]): Box | null {
  let current: Box | null = parent
  for (const type of types) {
    if (!current) return null
    current = child(buf, current, type)
  }
  return current
}

/** mvhd and mdhd share the layout of the fields read here. */
function timing(buf: Buffer, box: Box): { timescale: number; duration: number } {
  const version = buf[box.body]
  return version === 1
    ? { timescale: buf.readUInt32BE(box.body + 20), duration: Number(buf.readBigUInt64BE(box.body + 24)) }
    : { timescale: buf.readUInt32BE(box.body + 12), duration: buf.readUInt32BE(box.body + 16) }
}

/**
 * Shift that ffmpeg applies from the edit list: leading empty edits delay the track, the first real
 * edit skips `media_time` units. Cut lists with several real edits return null (ffprobe handles them).
 */
function editShift(buf: Buffer, trak: Box, movieTimescale: number, mediaTimescale: number): number | null {
  const elst = descend(buf, trak, 'edts', 'elst')
  if (!elst) return 0
  const version = buf[elst.body]
  const count = buf.readUInt32BE(elst.body + 4)
  const entrySize = version === 1 ? 20 : 12
  let empty = 0
  let mediaTime: number | null = null
  for (let index = 0; index < count; index++) {
    const at = elst.body + 8 + index * entrySize
    if (at + entrySize > elst.end) return null
    const duration = version === 1 ? Number(buf.readBigUInt64BE(at)) : buf.readUInt32BE(at)
    const time = version === 1 ? Number(buf.readBigInt64BE(at + 8)) : buf.readInt32BE(at + 4)
    if (time === -1) {
      if (mediaTime !== null) return null
      empty += duration
    } else if (mediaTime === null) {
      mediaTime = time
    } else {
      return null
    }
  }
  return (empty * mediaTimescale) / Math.max(1, movieTimescale) - (mediaTime ?? 0)
}

/** r_frame_rate as ffprobe reports it for these files: the nominal rate behind the jittery timestamps. */
export function nominalFrameRate(deltas: ReadonlyArray<readonly [count: number, delta: number]>, timescale: number): number {
  // A long VFR recording lists ~150,000 entries but only a few hundred distinct deltas.
  const histogram = new Map<number, number>()
  for (const [count, delta] of deltas) if (count > 0 && delta > 0) histogram.set(delta, (histogram.get(delta) ?? 0) + count)
  const sorted = [...histogram].map(([delta, count]) => [count, delta] as const).sort((a, b) => a[1] - b[1])
  const total = sorted.reduce((sum, [count]) => sum + count, 0)
  if (total === 0 || timescale <= 0) return 0
  let seen = 0
  let median = sorted[0][1]
  for (const [count, delta] of sorted) {
    seen += count
    median = delta
    if (seen * 2 >= total) break
  }
  const rate = timescale / median
  const ntsc = NTSC_RATES.find((candidate) => Math.abs(rate - candidate) < 0.002)
  if (ntsc) return ntsc
  const nearest = INTEGER_RATES.reduce((best, candidate) => (Math.abs(rate - candidate) < Math.abs(rate - best) ? candidate : best))
  return Math.abs(rate - nearest) / nearest < 0.03 ? nearest : rate
}

interface Track {
  handler: string
  fourcc: string
  stbl: Box
  timescale: number
  duration: number
  shift: number
  sampleEntry: number
}

function readTrack(buf: Buffer, trak: Box, movieTimescale: number): Track | null {
  const mdia = child(buf, trak, 'mdia')
  const mdhd = mdia && child(buf, mdia, 'mdhd')
  const hdlr = mdia && child(buf, mdia, 'hdlr')
  const stbl = mdia && descend(buf, mdia, 'minf', 'stbl')
  const stsd = stbl && child(buf, stbl, 'stsd')
  if (!mdhd || !hdlr || !stbl || !stsd || stsd.body + 16 > stsd.end) return null
  const { timescale, duration } = timing(buf, mdhd)
  const shift = editShift(buf, trak, movieTimescale, timescale)
  if (shift === null || timescale <= 0) return null
  return {
    handler: buf.toString('latin1', hdlr.body + 8, hdlr.body + 12),
    fourcc: buf.toString('latin1', stsd.body + 12, stsd.body + 16),
    stbl,
    timescale,
    duration,
    shift,
    sampleEntry: stsd.body + 8
  }
}

function sttsEntries(buf: Buffer, stts: Box): Array<[number, number]> {
  const count = Math.min(buf.readUInt32BE(stts.body + 4), Math.floor((stts.end - stts.body - 8) / 8))
  const entries: Array<[number, number]> = new Array(count)
  for (let index = 0; index < count; index++) {
    const at = stts.body + 8 + index * 8
    entries[index] = [buf.readUInt32BE(at), buf.readUInt32BE(at + 4)]
  }
  return entries
}

function totalSampleBytes(buf: Buffer, stsz: Box): { count: number; bytes: number } {
  const fixed = buf.readUInt32BE(stsz.body + 4)
  const count = buf.readUInt32BE(stsz.body + 8)
  if (fixed > 0) return { count, bytes: fixed * count }
  const listed = Math.min(count, Math.floor((stsz.end - stsz.body - 12) / 4))
  let bytes = 0
  for (let index = 0; index < listed; index++) bytes += buf.readUInt32BE(stsz.body + 12 + index * 4)
  return { count, bytes }
}

function presentationTimes(buf: Buffer, track: Track, stts: Array<[number, number]>, sampleCount: number): Float64Array {
  const times = new Float64Array(sampleCount)
  let sample = 0
  let dts = 0
  for (const [count, delta] of stts) {
    for (let step = 0; step < count && sample < sampleCount; step++) {
      times[sample++] = dts
      dts += delta
    }
  }
  const ctts = child(buf, track.stbl, 'ctts')
  if (ctts) {
    const entries = Math.min(buf.readUInt32BE(ctts.body + 4), Math.floor((ctts.end - ctts.body - 8) / 8))
    sample = 0
    for (let index = 0; index < entries && sample < sampleCount; index++) {
      const at = ctts.body + 8 + index * 8
      const count = buf.readUInt32BE(at)
      // ffmpeg reads the offset as signed in both versions of the box.
      const offset = buf.readInt32BE(at + 4)
      for (let step = 0; step < count && sample < sampleCount; step++) times[sample++] += offset
    }
  }
  for (let index = 0; index < sampleCount; index++) times[index] = (times[index] + track.shift) / track.timescale
  return times
}

/** Parses a whole "moov" box (header included). */
export function parseMp4Movie(moov: Buffer): Mp4Movie | null {
  if (moov.length < 8) return null
  const root: Box = { type: 'moov', start: 0, end: moov.length, body: moov.readUInt32BE(0) === 1 ? 16 : 8 }
  // Fragmented files keep their samples outside moov.
  if (child(moov, root, 'mvex')) return null
  const mvhd = child(moov, root, 'mvhd')
  if (!mvhd) return null
  const movie = timing(moov, mvhd)

  const tracks: Track[] = []
  for (const box of boxes(moov, root.body, root.end)) {
    if (box.type !== 'trak') continue
    const track = readTrack(moov, box, movie.timescale)
    if (track) tracks.push(track)
  }

  const videoTrack = tracks.find((track) => track.handler === 'vide')
  if (!videoTrack || !VIDEO_CODECS[videoTrack.fourcc]) return null
  const stts = child(moov, videoTrack.stbl, 'stts')
  const stsz = child(moov, videoTrack.stbl, 'stsz')
  if (!stts || !stsz) return null
  const deltas = sttsEntries(moov, stts)
  const { count: sampleCount, bytes } = totalSampleBytes(moov, stsz)
  if (sampleCount === 0) return null

  const entry = videoTrack.sampleEntry
  const videoSeconds = videoTrack.duration / videoTrack.timescale
  const nominal = nominalFrameRate(deltas, videoTrack.timescale)
  const average = videoSeconds > 0 ? sampleCount / videoSeconds : 0
  const frameTimes = presentationTimes(moov, videoTrack, deltas, sampleCount)
  let firstFrame = Infinity
  for (const time of frameTimes) if (time < firstFrame) firstFrame = time

  const video: VideoStreamInfo = {
    codec: VIDEO_CODECS[videoTrack.fourcc],
    width: moov.readUInt16BE(entry + 32),
    height: moov.readUInt16BE(entry + 34),
    fps: pickFps(nominal, average),
    bitrateKbps: videoSeconds > 0 ? Math.round((bytes * 8) / videoSeconds / 1000) : null,
    startTime: Number.isFinite(firstFrame) ? firstFrame : 0
  }
  const audio: AudioStreamInfo[] = tracks
    .filter((track) => track.handler === 'soun')
    .map((track, index) => ({
      index,
      codec: AUDIO_CODECS[track.fourcc] ?? track.fourcc.trim(),
      channels: moov.readUInt16BE(track.sampleEntry + 24) || 2
    }))
  const longestTrack = Math.max(...tracks.map((track) => track.duration / track.timescale))
  const durationSec = movie.timescale > 0 && movie.duration > 0 ? movie.duration / movie.timescale : longestTrack

  return { info: { durationSec, video, audio }, frameTimes }
}

/** Finds and parses the index of an MP4/MOV file; null when it is not one or looks unusual. */
export async function readMp4Movie(filePath: string): Promise<{ movie: Mp4Movie; sizeBytes: number } | null> {
  if (!MP4_EXTENSIONS.has(extname(filePath).toLowerCase())) return null
  const file = await open(filePath, 'r')
  try {
    const { size } = await file.stat()
    const header = Buffer.alloc(16)
    let at = 0
    while (at + 8 <= size) {
      const { bytesRead } = await file.read(header, 0, 16, at)
      if (bytesRead < 8) return null
      let boxSize = header.readUInt32BE(0)
      const type = header.toString('latin1', 4, 8)
      if (boxSize === 1) boxSize = bytesRead >= 16 ? Number(header.readBigUInt64BE(8)) : 0
      else if (boxSize === 0) boxSize = size - at
      if (boxSize < 8 || at + boxSize > size) return null
      // Fragments mean the samples are not all listed in moov.
      if (type === 'moof') return null
      if (type === 'moov') {
        if (boxSize > MAX_MOOV_BYTES) return null
        const moov = Buffer.allocUnsafe(boxSize)
        const { bytesRead: read } = await file.read(moov, 0, boxSize, at)
        if (read !== boxSize) return null
        const movie = parseMp4Movie(moov)
        return movie ? { movie, sizeBytes: size } : null
      }
      at += boxSize
    }
    return null
  } finally {
    await file.close()
  }
}
