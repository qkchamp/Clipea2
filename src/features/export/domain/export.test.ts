import { describe, expect, it } from 'vitest'
import { DISCORD_LIMITS, exceedsLimit } from './discordLimits'
import { describeEncoding, MIN_VIDEO_KBPS, nextVideoKbps, planEncoding, type EncodingPreferences, type SourceVideoSummary } from './encodingPlan'
import { compileRenderTimeline } from './renderTimeline'

const shadowPlay720: SourceVideoSummary = { width: 1280, height: 720, fps: 30, codec: 'h264', videoKbps: 4193 }
/** A typical preset for Discord clips: H.265, max 720p30, AAC 160. */
const discordPreset: EncodingPreferences = {
  codec: 'hevc',
  quality: 'high',
  maxHeight: 720,
  maxFps: 30,
  audioKbps: 160,
  sizeLimitBytes: DISCORD_LIMITS.free
}

describe('Discord limits', () => {
  it('uses the 20 MB free limit', () => {
    expect(DISCORD_LIMITS.free).toBe(20_000_000)
    expect(exceedsLimit(20_000_001, DISCORD_LIMITS.free)).toBe(true)
    expect(exceedsLimit(19_999_999, DISCORD_LIMITS.free)).toBe(false)
    expect(exceedsLimit(99_000_000, null)).toBe(false)
  })
})

describe('planEncoding', () => {
  it('keeps short clips at a quality ceiling instead of filling 20 MB', () => {
    const plan = planEncoding(10, shadowPlay720, discordPreset)
    expect(plan).toMatchObject({ width: 1280, height: 720, fps: 30, cq: 25, videoKbps: 3041, reduced: false, fits: true })
    expect(plan.grade).toBe('excelente')
    expect(plan.estimatedMaxBytes).toBeLessThan(5_000_000)
  })

  it('fits a 1:30 clip under 20 MB at 720p', () => {
    const plan = planEncoding(90, shadowPlay720, discordPreset)
    expect(plan.height).toBe(720)
    expect(plan.videoKbps).toBe(1485)
    expect(plan.estimatedMaxBytes).toBeLessThanOrEqual(DISCORD_LIMITS.free * 0.95 + 1)
    expect(plan.grade).toBe('buena')
  })

  it('reports how long a clip can be before losing 720p', () => {
    const plan = planEncoding(90, shadowPlay720, discordPreset)
    expect(plan.maxDurationAtPreferred).toBeCloseTo(131.8, 0)
  })

  it('lowers the resolution and the audio for long clips', () => {
    const plan = planEncoding(240, shadowPlay720, discordPreset)
    expect(plan).toMatchObject({ height: 480, width: 854, audioKbps: 96, reduced: true, fits: true })
    expect(plan.estimatedMaxBytes).toBeLessThanOrEqual(DISCORD_LIMITS.free)
  })

  it('says when a clip cannot fit at all', () => {
    const plan = planEncoding(1200, shadowPlay720, discordPreset)
    expect(plan.fits).toBe(false)
    expect(plan.maxDurationAtAll).toBeCloseTo(692.1, 0)
  })

  it('never upscales', () => {
    const plan = planEncoding(10, { ...shadowPlay720, width: 854, height: 480 }, discordPreset)
    expect(plan.height).toBe(480)
  })

  it('drops 1080p60 to 720p60 before going down to 30 fps', () => {
    const source = { width: 1920, height: 1080, fps: 60, codec: 'h264', videoKbps: 12000 }
    const preferences = { ...discordPreset, maxHeight: null, maxFps: null }
    expect(planEncoding(30, source, preferences)).toMatchObject({ height: 1080, fps: 60 })
    expect(planEncoding(60, source, preferences)).toMatchObject({ height: 720, fps: 60, width: 1280 })
  })

  it('ignores the limit when there is none', () => {
    const plan = planEncoding(600, shadowPlay720, { ...discordPreset, sizeLimitBytes: null })
    expect(plan).toMatchObject({ height: 720, fits: true, maxDurationAtPreferred: null })
  })

  it('uses codec specific quality targets', () => {
    expect(planEncoding(10, shadowPlay720, { ...discordPreset, codec: 'h264' }).cq).toBe(24)
    expect(planEncoding(10, shadowPlay720, { ...discordPreset, quality: 'light' }).cq).toBe(29)
  })
})

describe('nextVideoKbps', () => {
  it('scales video down so the retry lands under the limit', () => {
    const next = nextVideoKbps(1485, 21_000_000, 20_000_000, 160, 90)
    expect(next).toBeLessThan(1485)
    const expectedBytes = ((next + 160) * 1000) / 8 * 90
    expect(expectedBytes).toBeLessThan(20_000_000)
  })

  it('never goes below the floor', () => {
    expect(nextVideoKbps(130, 50_000_000, 1_000_000, 160, 90)).toBe(MIN_VIDEO_KBPS)
  })
})

describe('compileRenderTimeline', () => {
  const frame = 1 / 30

  it('passes a plain cut through', () => {
    const timeline = compileRenderTimeline([{ sourcePath: 'a.mp4', start: 50, end: 60 }], [], frame)
    expect(timeline.segments).toEqual([{ sourcePath: 'a.mp4', start: 50, end: 60, outputStart: 0, outputDuration: 10 }])
    expect(timeline.totalDuration).toBe(10)
  })

  it('places drawings of later segments after the earlier ones', () => {
    const timeline = compileRenderTimeline(
      [
        { sourcePath: 'a.mp4', start: 50, end: 60 },
        { sourcePath: 'b.mp4', start: 10, end: 13 }
      ],
      [
        { id: 'b1', sourcePath: 'b.mp4', start: 11, end: 12 },
        { id: 'other', sourcePath: 'c.mp4', start: 11, end: 12 }
      ],
      frame
    )
    expect(timeline.segments[1].outputStart).toBe(10)
    expect(timeline.overlays).toEqual([{ annotationId: 'b1', start: 11, end: 12, sourceStart: 11 }])
    expect(timeline.totalDuration).toBe(13)
  })

  it('keeps drawings that started right before the cut and clips them at the end', () => {
    const timeline = compileRenderTimeline(
      [{ sourcePath: 'a.mp4', start: 50, end: 60 }],
      [
        { id: 'before', sourcePath: 'a.mp4', start: 49, end: 51 },
        { id: 'tail', sourcePath: 'a.mp4', start: 59, end: 61 },
        { id: 'outside', sourcePath: 'a.mp4', start: 45, end: 50 }
      ],
      frame
    )
    expect(timeline.overlays).toEqual([
      { annotationId: 'before', start: 0, end: 1, sourceStart: 50 },
      { annotationId: 'tail', start: 9, end: 10, sourceStart: 59 }
    ])
  })

  it('shows a drawing in every cut of the montage that covers it, at least one frame', () => {
    const timeline = compileRenderTimeline(
      [
        { sourcePath: 'a.mp4', start: 0, end: 4 },
        { sourcePath: 'a.mp4', start: 2, end: 6 }
      ],
      [{ id: 'd', sourcePath: 'a.mp4', start: 3, end: 3 }],
      frame
    )
    expect(timeline.overlays).toEqual([
      { annotationId: 'd', start: 3, end: 3 + frame, sourceStart: 3 },
      { annotationId: 'd', start: 5, end: 5 + frame, sourceStart: 3 }
    ])
  })
})

describe('describeEncoding', () => {
  it('reads like the export panel', () => {
    const video = { width: 1280, height: 720, fps: 30, codec: 'hevc', kbps: 1485 } as const
    expect(describeEncoding(video, true)).toBe('1280×720 · 30 fps · H.265 (GPU) · 1,5 Mbps máx.')
    expect(describeEncoding({ ...video, codec: 'h264' }, false)).toBe('1280×720 · 30 fps · H.264 (CPU) · 1,5 Mbps máx.')
    expect(describeEncoding(video, null)).toBe('1280×720 · 30 fps · H.265 · 1,5 Mbps máx.')
  })
})
