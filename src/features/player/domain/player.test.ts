import { describe, expect, it } from 'vitest'
import { FrameIndex } from '@features/media/domain/frameIndex'
import { canRecover } from './mediaRecovery'
import { formatPlaybackRate, stepPlaybackRate } from './playbackRate'
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
