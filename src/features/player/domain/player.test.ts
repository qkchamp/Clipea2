import { describe, expect, it } from 'vitest'
import { FrameIndex } from '@features/media/domain/frameIndex'
import { canRecover } from './mediaRecovery'
import { formatPlaybackRate, parsePlaybackRate, playbackRateFraction, stepPlaybackRate } from './playbackRate'
import { parseVolumePercent, stepVolume, volumePercent } from './volume'
import { frameEndTime, frameNumberAt, frameStartTime, frameStepTarget, totalFrames, type FrameClock } from './frameClock'

describe('stepPlaybackRate', () => {
  it('moves in 0.25x steps', () => {
    expect(stepPlaybackRate(1, -1)).toBe(0.75)
    expect(stepPlaybackRate(1, 1)).toBe(1.25)
  })

  it('stops at 0.25x and 4.00x', () => {
    expect(stepPlaybackRate(0.25, -1)).toBe(0.25)
    expect(stepPlaybackRate(4, 1)).toBe(4)
  })

  it('snaps odd rates back onto the grid', () => {
    expect(stepPlaybackRate(1.1, 1)).toBe(1.25)
  })

  it('always shows two decimals', () => {
    expect(formatPlaybackRate(0.75)).toBe('0.75x')
    expect(formatPlaybackRate(1)).toBe('1.00x')
  })
})

describe('typed playback rate', () => {
  it('reads a speed with a dot or a comma, with or without the x', () => {
    expect(parsePlaybackRate('1.5')).toBe(1.5)
    expect(parsePlaybackRate('1,25x')).toBe(1.25)
    expect(parsePlaybackRate(' 2 X ')).toBe(2)
  })

  it('keeps it between 0.25x and 4x', () => {
    expect(parsePlaybackRate('10')).toBe(4)
    expect(parsePlaybackRate('0')).toBe(0.25)
  })

  it('ignores what is not a number', () => {
    expect(parsePlaybackRate('')).toBeNull()
    expect(parsePlaybackRate('rápido')).toBeNull()
  })

  it('places the slowest speed at the bottom of the slider and the fastest at the top', () => {
    expect(playbackRateFraction(0.25)).toBe(0)
    expect(playbackRateFraction(4)).toBe(1)
  })
})

describe('volume percentage', () => {
  it('shows the volume as a whole percentage', () => {
    expect(volumePercent(0.75)).toBe(75)
    expect(volumePercent(0.333)).toBe(33)
  })

  it('reads what the user types, with or without the % sign', () => {
    expect(parseVolumePercent('75')).toBe(0.75)
    expect(parseVolumePercent(' 40 % ')).toBe(0.4)
    expect(parseVolumePercent('12,5')).toBe(0.125)
  })

  it('keeps a typed value between 0 and 100', () => {
    expect(parseVolumePercent('250')).toBe(1)
    expect(parseVolumePercent('0')).toBe(0)
  })

  it('moves 5% per wheel notch, from the nearest step', () => {
    expect(stepVolume(0.5, 1)).toBe(0.55)
    expect(stepVolume(0.5, -1)).toBe(0.45)
    expect(stepVolume(0.33, 1)).toBe(0.4)
  })

  it('stops at silence and at full volume', () => {
    expect(stepVolume(0, -1)).toBe(0)
    expect(stepVolume(1, 1)).toBe(1)
  })

  it('ignores what is not a number', () => {
    expect(parseVolumePercent('')).toBeNull()
    expect(parseVolumePercent('mucho')).toBeNull()
    expect(parseVolumePercent('-20')).toBeNull()
  })
})

describe('frame stepping without a frame table', () => {
  const clock: FrameClock = { fps: 30, duration: 2, index: null }

  it('counts frames from the nominal rate', () => {
    expect(totalFrames(clock)).toBe(60)
    expect(frameNumberAt(clock, 1)).toBe(30)
  })

  it('steps to the middle of the next and previous frame', () => {
    expect(frameStepTarget(clock, 1, 1)).toBeCloseTo(31.5 / 30)
    expect(frameStepTarget(clock, 1, -1)).toBeCloseTo(29.5 / 30)
  })

  it('does not step outside the video', () => {
    expect(frameStepTarget(clock, 0, -1)).toBeCloseTo(0.5 / 30)
    expect(frameNumberAt(clock, frameStepTarget(clock, 1.99, 5))).toBe(59)
  })
})

describe('frame stepping with a VFR frame table', () => {
  // Irregular spacing: a frame-by-fps estimate would drift here.
  const index = FrameIndex.fromTimestamps([0, 0.03, 0.07, 0.1, 0.16, 0.2])!
  const clock: FrameClock = { fps: 30, duration: 0.23, index }

  it('lands exactly on the neighbouring frames', () => {
    const next = frameStepTarget(clock, 0.1, 1)
    expect(frameNumberAt(clock, next)).toBe(4)
    expect(frameNumberAt(clock, frameStepTarget(clock, next, -1))).toBe(3)
  })

  it('pins annotations to the start of the visible frame', () => {
    expect(frameStartTime(clock, 0.18)).toBeCloseTo(0.16)
  })
})

describe('canRecover', () => {
  it('reloads after a decoder hiccup, a few times at most', () => {
    expect(canRecover(3, [], 1000)).toBe(true)
    expect(canRecover(undefined, [500, 800], 1000)).toBe(true)
    expect(canRecover(3, [200, 500, 800], 1000)).toBe(false)
    // Old attempts fall out of the window.
    expect(canRecover(3, [200, 500, 800], 20_000)).toBe(true)
  })

  it('never retries a file the player cannot read at all', () => {
    expect(canRecover(4, [], 1000)).toBe(false)
  })
})

describe('frameEndTime', () => {
  it('ends a VFR frame where the next one really starts', () => {
    const index = FrameIndex.fromTimestamps([0, 0.033, 0.1, 0.133], 0, 30)!
    const clock: FrameClock = { fps: 30, duration: 0.2, index }
    expect(frameEndTime(clock, 0.05)).toBeCloseTo(0.1)
    expect(frameEndTime(clock, 0.14)).toBeLessThanOrEqual(0.2)
  })

  it('uses the nominal rate without a table', () => {
    const clock: FrameClock = { fps: 30, duration: 10, index: null }
    expect(frameEndTime(clock, 1.01)).toBeCloseTo(31 / 30)
  })
})
