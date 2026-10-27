import { describe, expect, it } from 'vitest'
import { isNewerRelease, newestRelease, releaseNumber } from './ffmpegRelease'

describe('releaseNumber', () => {
  it('reads the release out of the version ffmpeg prints', () => {
    expect(releaseNumber('8.1.2-full_build-www.gyan.dev')).toEqual([8, 1, 2])
    expect(releaseNumber('9.0.2')).toEqual([9, 0, 2])
    expect(releaseNumber('7.1')).toEqual([7, 1])
  })

  it('has no number for git snapshots', () => {
    expect(releaseNumber('N-118000-g1234abcd-www.gyan.dev')).toBeNull()
    expect(releaseNumber('desconocida')).toBeNull()
  })
})

describe('isNewerRelease', () => {
  it('compares part by part, not as text', () => {
    expect(isNewerRelease('9.0.2', '8.1.2-full_build-www.gyan.dev')).toBe(true)
    expect(isNewerRelease('8.10', '8.9')).toBe(true)
    expect(isNewerRelease('8.1', '8.1.0')).toBe(false)
  })

  it('offers nothing when the installed one is the same or newer', () => {
    expect(isNewerRelease('9.0.2', '9.0.2-essentials_build-www.gyan.dev')).toBe(false)
    expect(isNewerRelease('9.0.2', '9.1')).toBe(false)
  })

  it('always offers it when nothing is installed', () => {
    expect(isNewerRelease('9.0.2', null)).toBe(true)
  })

  it('leaves a build without a release number alone', () => {
    expect(isNewerRelease('9.0.2', 'N-118000-g1234abcd')).toBe(false)
  })
})

describe('newestRelease', () => {
  it('picks the newest version folder and skips anything else', () => {
    expect(newestRelease(['8.1.2', '9.0.2', '.descarga', '10.0', 'notas'])).toBe('10.0')
  })

  it('is null without version folders', () => {
    expect(newestRelease([])).toBeNull()
    expect(newestRelease(['.descarga'])).toBeNull()
  })
})
