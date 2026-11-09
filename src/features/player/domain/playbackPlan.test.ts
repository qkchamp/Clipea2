import { describe, expect, it } from 'vitest'
import type { MediaInfo } from '@features/media/domain/mediaInfo'
import { needsConversion } from './mediaRecovery'
import { fullConversion, opensDirectly, planKey, playbackPlan } from './playbackPlan'

const file = (path: string, video: string | null, ...audio: string[]): MediaInfo => ({
  path,
  durationSec: 12,
  sizeBytes: 1_000_000,
  video: video === null ? null : { codec: video, width: 1920, height: 1080, fps: 60, bitrateKbps: 20_000, startTime: 0 },
  audio: audio.map((codec, index) => ({ index, codec, channels: 2 }))
})

describe('opensDirectly', () => {
  it('knows the containers the player loads by itself', () => {
    expect(opensDirectly('C:\\clips\\Rematch 2026.10.03 - 05.02.06.01.DVR.mp4')).toBe(true)
    expect(opensDirectly('obs.MKV')).toBe(true)
    expect(opensDirectly('phone.3gp')).toBe(true)
  })

  it('leaves the rest to ffmpeg', () => {
    for (const name of ['old.avi', 'stream.flv', 'tv.ts', 'camera.mts', 'dvd.mpg', 'capture.wmv', 'movie.ogv']) {
      expect(opensDirectly(name)).toBe(false)
    }
  })
})

describe('playbackPlan', () => {
  it('plays what Chromium decodes as it is', () => {
    expect(playbackPlan(file('a.mp4', 'h264', 'aac'))).toBe('direct')
    // ShadowPlay with the microphone on its own track.
    expect(playbackPlan(file('a.mp4', 'hevc', 'aac', 'aac'))).toBe('direct')
    expect(playbackPlan(file('a.mkv', 'av1', 'opus'))).toBe('direct')
    expect(playbackPlan(file('a.webm', 'vp9', 'vorbis'))).toBe('direct')
    expect(playbackPlan(file('a.mov', 'h264', 'pcm_s24le'))).toBe('direct')
    expect(playbackPlan(file('a.mp4', 'h264'))).toBe('direct')
    // Sound only: nothing to convert.
    expect(playbackPlan(file('a.mkv', null, 'opus'))).toBe('direct')
  })

  it('only moves the streams when the container is the problem', () => {
    expect(playbackPlan(file('a.flv', 'h264', 'aac'))).toEqual({ video: 'copy', audio: 'copy' })
    expect(playbackPlan(file('a.m2ts', 'h264', 'aac'))).toEqual({ video: 'copy', audio: 'copy' })
    expect(playbackPlan(file('a.ts', 'hevc'))).toEqual({ video: 'copy', audio: 'none' })
  })

  it('encodes only the sound when the picture already plays', () => {
    expect(playbackPlan(file('a.mkv', 'h264', 'ac3'))).toEqual({ video: 'copy', audio: 'encode' })
    expect(playbackPlan(file('a.mts', 'h264', 'ac3'))).toEqual({ video: 'copy', audio: 'encode' })
    // One track that does not play is enough: the copy carries them all.
    expect(playbackPlan(file('a.mkv', 'h264', 'aac', 'dts'))).toEqual({ video: 'copy', audio: 'encode' })
    expect(playbackPlan(file('a.mov', 'h264', 'alac'))).toEqual({ video: 'copy', audio: 'encode' })
  })

  it('encodes the picture Chromium has no decoder for, even inside an MP4', () => {
    expect(playbackPlan(file('a.mp4', 'mpeg4', 'aac'))).toEqual({ video: 'encode', audio: 'copy' })
    expect(playbackPlan(file('a.mov', 'prores', 'pcm_s16le'))).toEqual({ video: 'encode', audio: 'encode' })
    expect(playbackPlan(file('a.mpg', 'mpeg2video', 'mp2'))).toEqual({ video: 'encode', audio: 'encode' })
    expect(playbackPlan(file('a.wmv', 'wmv2', 'wmav2'))).toEqual({ video: 'encode', audio: 'encode' })
    expect(playbackPlan(file('a.avi', 'mjpeg'))).toEqual({ video: 'encode', audio: 'none' })
  })

  it('never copies into the MP4 a stream it cannot hold', () => {
    expect(playbackPlan(file('a.ts', 'vp8', 'vorbis'))).toEqual({ video: 'encode', audio: 'encode' })
    expect(playbackPlan(file('a.ts', 'h264', 'pcm_s16le'))).toEqual({ video: 'copy', audio: 'encode' })
  })

  it('encodes the picture of an AVI even when it is H.264: its frames carry no presentation times', () => {
    expect(playbackPlan(file('a.avi', 'h264', 'mp3'))).toEqual({ video: 'encode', audio: 'copy' })
    expect(playbackPlan(file('a.DIVX', 'h264', 'aac'))).toEqual({ video: 'encode', audio: 'copy' })
  })
})

describe('fullConversion', () => {
  it('encodes everything, whatever the first plan was', () => {
    expect(fullConversion(file('a.mp4', 'hevc', 'aac'))).toEqual({ video: 'encode', audio: 'encode' })
    expect(fullConversion(file('a.mp4', 'hevc'))).toEqual({ video: 'encode', audio: 'none' })
  })

  it('is a different cached copy than the first plan', () => {
    const info = file('a.ts', 'h264', 'aac')
    const first = playbackPlan(info)
    expect(first).not.toBe('direct')
    if (first !== 'direct') expect(planKey(first)).not.toBe(planKey(fullConversion(info)))
  })
})

describe('needsConversion', () => {
  it('is what Chromium says when it has no decoder for the file', () => {
    expect(needsConversion(4)).toBe(true)
    expect(needsConversion(3)).toBe(false)
    expect(needsConversion(undefined)).toBe(false)
  })
})
