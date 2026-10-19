import { describe, expect, it } from 'vitest'
import { nominalFrameRate, parseMp4Movie } from './mp4Reader'

const u32 = (...values: number[]): Buffer => {
  const buf = Buffer.alloc(values.length * 4)
  values.forEach((value, index) => buf.writeInt32BE(value | 0, index * 4))
  return buf
}

const box = (type: string, ...parts: Buffer[]): Buffer => {
  const body = Buffer.concat(parts)
  const header = Buffer.alloc(8)
  header.writeUInt32BE(body.length + 8, 0)
  header.write(type, 4, 'latin1')
  return Buffer.concat([header, body])
}

/** version/flags + creation + modification + timescale + duration, padded like the real boxes. */
const header = (type: 'mvhd' | 'mdhd', timescale: number, duration: number): Buffer =>
  box(type, u32(0, 0, 0, timescale, duration), Buffer.alloc(type === 'mvhd' ? 80 : 4))

const hdlr = (handler: string): Buffer => box('hdlr', u32(0, 0), Buffer.from(handler, 'latin1'), Buffer.alloc(13))

function sampleEntry(fourcc: string, kind: 'video' | 'audio', a: number, b = 0): Buffer {
  const entry = Buffer.alloc(kind === 'video' ? 86 : 36)
  entry.writeUInt32BE(entry.length, 0)
  entry.write(fourcc, 4, 'latin1')
  if (kind === 'video') {
    entry.writeUInt16BE(a, 32)
    entry.writeUInt16BE(b, 34)
  } else {
    entry.writeUInt16BE(a, 24)
  }
  return entry
}

interface TrackSpec {
  handler: 'vide' | 'soun'
  entry: Buffer
  timescale: number
  deltas: number[]
  sizes: number[]
  offsets?: number[]
  edit?: { duration: number; mediaTime: number }
}

function trak(track: TrackSpec): Buffer {
  const duration = track.deltas.reduce((sum, delta) => sum + delta, 0)
  const stbl = box(
    'stbl',
    box('stsd', u32(0, 1), track.entry),
    box('stts', u32(0, track.deltas.length), ...track.deltas.map((delta) => u32(1, delta))),
    ...(track.offsets ? [box('ctts', u32(0, track.offsets.length), ...track.offsets.map((offset) => u32(1, offset)))] : []),
    box('stsz', u32(0, 0, track.sizes.length), u32(...track.sizes))
  )
  const edts = track.edit ? [box('edts', box('elst', u32(0, 1, track.edit.duration, track.edit.mediaTime, 0x10000)))] : []
  return box('trak', ...edts, box('mdia', header('mdhd', track.timescale, duration), hdlr(track.handler), box('minf', stbl)))
}

describe('parseMp4Movie', () => {
  it('reads a ShadowPlay-like VFR recording with two audio tracks', () => {
    const moov = box(
      'moov',
      header('mvhd', 1000, 2000),
      trak({ handler: 'vide', entry: sampleEntry('hvc1', 'video', 2560, 1440), timescale: 90000, deltas: [3000, 2990, 3010, 3000], sizes: [50_000, 10_000, 10_000, 10_000] }),
      trak({ handler: 'soun', entry: sampleEntry('mp4a', 'audio', 2), timescale: 48000, deltas: [1024], sizes: [300] }),
      trak({ handler: 'soun', entry: sampleEntry('mp4a', 'audio', 1), timescale: 48000, deltas: [1024], sizes: [300] })
    )
    const movie = parseMp4Movie(moov)!
    expect(Array.from(movie.frameTimes)).toEqual([0, 3000 / 90000, 5990 / 90000, 9000 / 90000])
    expect(movie.info.durationSec).toBe(2)
    expect(movie.info.video).toEqual({
      codec: 'hevc',
      width: 2560,
      height: 1440,
      fps: 30,
      bitrateKbps: Math.round((80_000 * 8) / (12_000 / 90000) / 1000),
      startTime: 0
    })
    expect(movie.info.audio).toEqual([
      { index: 0, codec: 'aac', channels: 2 },
      { index: 1, codec: 'aac', channels: 1 }
    ])
  })

  it('applies B-frame offsets and the edit list like ffmpeg does', () => {
    const moov = box(
      'moov',
      header('mvhd', 1000, 100),
      trak({
        handler: 'vide',
        entry: sampleEntry('avc1', 'video', 1280, 720),
        timescale: 30,
        deltas: [1, 1, 1],
        sizes: [10, 10, 10],
        offsets: [2, 4, 2],
        edit: { duration: 100, mediaTime: 2 }
      })
    )
    const movie = parseMp4Movie(moov)!
    expect(Array.from(movie.frameTimes, (time) => Math.round(time * 30))).toEqual([0, 3, 2])
    expect(movie.info.video?.startTime).toBe(0)
  })

  it('leaves fragmented files and unknown codecs to ffprobe', () => {
    const video = trak({ handler: 'vide', entry: sampleEntry('avc1', 'video', 640, 360), timescale: 30, deltas: [1], sizes: [1] })
    expect(parseMp4Movie(box('moov', header('mvhd', 1000, 1), video, box('mvex')))).toBeNull()
    const prores = trak({ handler: 'vide', entry: sampleEntry('apcn', 'video', 640, 360), timescale: 30, deltas: [1], sizes: [1] })
    expect(parseMp4Movie(box('moov', header('mvhd', 1000, 1), prores))).toBeNull()
  })
})

describe('nominalFrameRate', () => {
  it('finds the rate behind jittery timestamps', () => {
    expect(nominalFrameRate([[10, 1490], [10, 1510], [5, 3000]], 90000)).toBe(60)
    expect(nominalFrameRate([[100, 1001]], 30000)).toBeCloseTo(29.97, 2)
    expect(nominalFrameRate([[100, 1000]], 37000)).toBe(37)
  })
})
