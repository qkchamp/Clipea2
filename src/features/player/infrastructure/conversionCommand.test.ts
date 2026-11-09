import { describe, expect, it } from 'vitest'
import { conversionArgs, type ConversionSpec } from './conversionCommand'

const spec = (overrides: Partial<ConversionSpec> = {}): ConversionSpec => ({
  input: 'C:/clips/old.avi',
  output: 'C:/cache/playback/abc.mp4.partial',
  plan: { video: 'encode', audio: 'encode' },
  gpu: null,
  fps: 30,
  ...overrides
})

const valueOf = (args: string[], flag: string): string => args[args.indexOf(flag) + 1]

describe('conversionArgs', () => {
  it('writes an MP4 whatever the name of the output', () => {
    const args = conversionArgs(spec())
    expect(args.slice(-3)).toEqual(['-f', 'mp4', 'C:/cache/playback/abc.mp4.partial'])
    expect(valueOf(args, '-i')).toBe('C:/clips/old.avi')
  })

  it('takes the first video and every audio track, nothing else', () => {
    const args = conversionArgs(spec())
    expect(args.join(' ')).toContain('-map 0:v:0 -map 0:a? -sn -dn')
  })

  it('copies the streams the player already decodes', () => {
    const args = conversionArgs(spec({ plan: { video: 'copy', audio: 'copy' } }))
    expect(valueOf(args, '-c:v')).toBe('copy')
    expect(valueOf(args, '-c:a')).toBe('copy')
    expect(args).not.toContain('-vf')
  })

  it('encodes H.264 keeping every frame at its own time', () => {
    const args = conversionArgs(spec())
    expect(valueOf(args, '-c:v')).toBe('libx264')
    expect(valueOf(args, '-fps_mode')).toBe('vfr')
    expect(valueOf(args, '-vf')).toBe('scale=trunc(iw/2)*2:trunc(ih/2)*2')
  })

  it('puts a keyframe every half second', () => {
    expect(valueOf(conversionArgs(spec({ fps: 60 })), '-g')).toBe('30')
    expect(valueOf(conversionArgs(spec({ fps: 29.97 })), '-g')).toBe('15')
    expect(valueOf(conversionArgs(spec({ fps: 0 })), '-g')).toBe('15')
  })

  it('encodes on the GPU when there is one', () => {
    expect(valueOf(conversionArgs(spec({ gpu: 'nvidia' })), '-c:v')).toBe('h264_nvenc')
    expect(valueOf(conversionArgs(spec({ gpu: 'amd' })), '-c:v')).toBe('h264_amf')
    expect(valueOf(conversionArgs(spec({ gpu: 'intel' })), '-c:v')).toBe('h264_qsv')
  })

  it('turns any sound into stereo AAC', () => {
    const args = conversionArgs(spec({ plan: { video: 'copy', audio: 'encode' } }))
    expect(valueOf(args, '-c:a')).toBe('aac')
    expect(valueOf(args, '-ac')).toBe('2')
  })

  it('maps no audio for a silent video', () => {
    const args = conversionArgs(spec({ plan: { video: 'encode', audio: 'none' } }))
    expect(args).not.toContain('0:a?')
    expect(args).not.toContain('-c:a')
  })
})
