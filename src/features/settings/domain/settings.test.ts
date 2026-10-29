import { describe, expect, it } from 'vitest'
import { mergeSettings, type AppSettings } from './settings'

const base: AppSettings = {
  libraryRoots: ['C:/Videos/NVIDIA'],
  outputDir: 'C:/Videos/NVIDIA/PARA_DISCORD',
  ffmpegDir: null,
  hardwareAcceleration: true,
  classicTimeline: false,
  codec: 'hevc',
  quality: 'high',
  maxHeight: 720,
  maxFps: 30,
  audioKbps: 160,
  sizeLimitMb: 20
}

describe('mergeSettings', () => {
  it('applies valid values', () => {
    expect(mergeSettings(base, { codec: 'h264', sizeLimitMb: null, maxHeight: 1080 })).toMatchObject({
      codec: 'h264',
      sizeLimitMb: null,
      maxHeight: 1080
    })
  })

  it('ignores invalid values', () => {
    expect(mergeSettings(base, { codec: 'vp9', quality: 'ultra', audioKbps: -5, outputDir: '  ' })).toEqual(base)
  })

  it('keeps several library folders, without blanks or repeats', () => {
    expect(mergeSettings(base, { libraryRoots: ['C:/A', ' ', 'D:/B', 'C:/A'] }).libraryRoots).toEqual(['C:/A', 'D:/B'])
    expect(mergeSettings(base, { libraryRoots: [] }).libraryRoots).toEqual([])
    expect(mergeSettings(base, { libraryRoots: 'C:/A' }).libraryRoots).toEqual(base.libraryRoots)
  })

  it('reads the single library folder of older settings', () => {
    expect(mergeSettings(base, { libraryRoot: 'D:/Clips' }).libraryRoots).toEqual(['D:/Clips'])
  })

  it('turns GPU acceleration off and on', () => {
    expect(mergeSettings(base, { hardwareAcceleration: false }).hardwareAcceleration).toBe(false)
    expect(mergeSettings({ ...base, hardwareAcceleration: false }, { hardwareAcceleration: 'yes' }).hardwareAcceleration).toBe(false)
  })

  it('turns the old timeline on and off', () => {
    expect(mergeSettings(base, { classicTimeline: true }).classicTimeline).toBe(true)
    expect(mergeSettings({ ...base, classicTimeline: true }, { classicTimeline: 'no' }).classicTimeline).toBe(true)
    expect(mergeSettings(base, {}).classicTimeline).toBe(false)
  })

  it('clears the ffmpeg folder with an empty value', () => {
    expect(mergeSettings({ ...base, ffmpegDir: 'C:/ffmpeg' }, { ffmpegDir: '' }).ffmpegDir).toBeNull()
  })
})
