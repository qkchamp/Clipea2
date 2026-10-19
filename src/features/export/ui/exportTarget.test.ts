import { describe, expect, it } from 'vitest'
import type { MediaInfo } from '@features/media/domain/mediaInfo'
import { defaultFileName, preferencesFrom, resolveExportTarget, sourceSummary } from './exportTarget'

const fish = 'C:\\NVIDIA\\How To Fish\\How To Fish 2026.09.16 - 02.47.12.06.DVR.mp4'
const rematch = 'C:\\NVIDIA\\Rematch\\Rematch 2026.10.03 - 05.02.06.01.mp4'

const info = (path: string, height: number, fps = 30): MediaInfo => ({
  path,
  durationSec: 60,
  sizeBytes: 1,
  video: { codec: 'h264', width: (height * 16) / 9, height, fps, bitrateKbps: 4000, startTime: 0 },
  audio: []
})

describe('resolveExportTarget', () => {
  const segment = { id: 'a', sourcePath: fish, sourceLabel: 'x', start: 1, end: 3 }

  it('exports the montage when it has segments', () => {
    expect(resolveExportTarget([segment], { sourcePath: rematch, range: { start: 0, end: 4 } })?.kind).toBe('montage')
  })

  it('falls back to the current selection', () => {
    expect(resolveExportTarget([], { sourcePath: rematch, range: { start: 50, end: 60 } })).toEqual({
      kind: 'selection',
      segments: [{ sourcePath: rematch, start: 50, end: 60 }]
    })
  })

  it('returns nothing without a valid selection', () => {
    expect(resolveExportTarget([], null)).toBeNull()
    expect(resolveExportTarget([], { sourcePath: rematch, range: { start: 5, end: 5 } })).toBeNull()
  })
})

describe('sourceSummary', () => {
  it('waits for every source to be probed and picks the biggest', () => {
    expect(sourceSummary([fish, rematch], { [fish]: info(fish, 720) })).toBeNull()
    expect(sourceSummary([fish, rematch], { [fish]: info(fish, 720), [rematch]: info(rematch, 1080) })?.height).toBe(1080)
  })
})

describe('preferencesFrom', () => {
  it('turns the MB setting into bytes', () => {
    const base = {
      libraryRoots: [],
      hardwareAcceleration: true,
      outputDir: '',
      ffmpegDir: null,
      codec: 'hevc' as const,
      quality: 'high' as const,
      maxHeight: 720,
      maxFps: 30,
      audioKbps: 160
    }
    expect(preferencesFrom({ ...base, sizeLimitMb: 20 }).sizeLimitBytes).toBe(20_000_000)
    expect(preferencesFrom({ ...base, sizeLimitMb: null }).sizeLimitBytes).toBeNull()
  })
})

describe('defaultFileName', () => {
  const now = new Date(2026, 9, 3, 7, 42)

  it('uses the game name for clips of one game', () => {
    expect(defaultFileName({ kind: 'selection', segments: [{ sourcePath: fish, start: 0, end: 1 }] }, now)).toBe(
      'How To Fish 2026-10-03 07.42'
    )
  })

  it('says Montaje when mixing games', () => {
    const target = {
      kind: 'montage' as const,
      segments: [
        { sourcePath: fish, start: 0, end: 1 },
        { sourcePath: rematch, start: 0, end: 1 }
      ]
    }
    expect(defaultFileName(target, now)).toBe('Montaje 2026-10-03 07.42')
  })
})
