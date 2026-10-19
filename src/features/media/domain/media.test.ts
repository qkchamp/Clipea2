import { describe, expect, it } from 'vitest'
import { FrameIndex } from './frameIndex'
import { mediaInfoFromFfprobe, parseFrameRate, pickFps } from './mediaInfo'

describe('mediaInfoFromFfprobe', () => {
  it('maps a ShadowPlay probe', () => {
    const info = mediaInfoFromFfprobe('clip.mp4', {
      streams: [
        {
          codec_type: 'video',
          codec_name: 'h264',
          width: 1280,
          height: 720,
          r_frame_rate: '30/1',
          avg_frame_rate: '163620000/5454121',
          bit_rate: '4193485',
          start_time: '0.000000'
        },
        { codec_type: 'audio', codec_name: 'aac', channels: 2 }
      ],
      format: { duration: '60.607792', size: '33307917' }
    })
    expect(info.video).toEqual({ codec: 'h264', width: 1280, height: 720, fps: 30, bitrateKbps: 4193, startTime: 0 })
    expect(info.audio).toEqual([{ index: 0, codec: 'aac', channels: 2 }])
    expect(info.durationSec).toBeCloseTo(60.607792)
    expect(info.sizeBytes).toBe(33307917)
  })

  it('ignores cover art and tolerates missing fields', () => {
    const info = mediaInfoFromFfprobe('a.mp4', {
      streams: [{ codec_type: 'video', codec_name: 'mjpeg', disposition: { attached_pic: 1 } }]
    })
    expect(info.video).toBeNull()
    expect(info.durationSec).toBe(0)
  })
})

describe('frame rates', () => {
  it('parses fractions', () => {
    expect(parseFrameRate('30000/1001')).toBeCloseTo(29.97, 2)
    expect(parseFrameRate('0/0')).toBe(0)
    expect(parseFrameRate(undefined)).toBe(0)
  })

  it('prefers the nominal rate and falls back sensibly', () => {
    expect(pickFps(30, 29.9997)).toBe(30)
    expect(pickFps(90000, 59.94)).toBe(59.94)
    expect(pickFps(0, 0)).toBe(30)
  })
})

describe('FrameIndex', () => {
  // VFR-ish timestamps with a 0.5 s start offset and out-of-order packets (B-frames).
  const index = FrameIndex.fromTimestamps([0.5, 0.5667, 0.5333, 0.6, 0.6334], 0.5)!

  it('sorts and rebases timestamps', () => {
    expect(index.count).toBe(5)
    expect(index.timeOf(0)).toBe(0)
    expect(index.timeOf(2)).toBeCloseTo(0.0667)
  })

  it('finds the frame on screen at a time', () => {
    expect(index.indexAt(0)).toBe(0)
    expect(index.indexAt(0.05)).toBe(1)
    expect(index.indexAt(0.0333)).toBe(1)
    expect(index.indexAt(5)).toBe(4)
    expect(index.indexAt(-1)).toBe(0)
  })

  it('seeks to the middle of a frame interval', () => {
    expect(index.seekTimeOf(1)).toBeCloseTo((0.0333 + 0.0667) / 2)
    expect(index.indexAt(index.seekTimeOf(3))).toBe(3)
    expect(index.indexAt(index.seekTimeOf(4))).toBe(4)
  })

  it('returns null without frames', () => {
    expect(FrameIndex.fromTimestamps([])).toBeNull()
  })
})
