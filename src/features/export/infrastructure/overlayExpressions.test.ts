import { describe, expect, it } from 'vitest'
import { offsetAt, type Annotation } from '@features/annotations/domain/annotation'
import { lookAt, type Effect } from '@features/annotations/domain/effects'
import { compileRenderTimeline, type RenderEffects } from '../domain/renderTimeline'
import { evaluateExpression } from './ffmpegExpression.testkit'
import { needsFrames, overlayLook, validEffects } from './overlayExpressions'

const FPS = 30
const WIDTH = 1280
const HEIGHT = 720
const HALF = 0.5 / FPS
const CENTRE = { x: 0.4, y: 0.6 }

const EVERYTHING: Effect[] = [
  { kind: 'fadeIn', duration: 0.8 },
  { kind: 'fadeOut', duration: 1.2 },
  { kind: 'zoomIn', duration: 0.5 },
  { kind: 'zoomOut', duration: 0.7 },
  { kind: 'slideIn', duration: 0.6, side: 'left' },
  { kind: 'slideOut', duration: 0.9, side: 'bottom' },
  { kind: 'blink', rate: 2 },
  { kind: 'pulse', rate: 1.5 }
]

const annotation = (start: number, end: number, effects: Effect[], keyframes?: Annotation['keyframes']): Annotation => ({
  id: 'd1',
  sourcePath: 'a.mp4',
  start,
  end,
  shape: { kind: 'rect', from: { x: 0.3, y: 0.5 }, to: { x: 0.5, y: 0.7 }, style: { color: '#fff', width: 0.007 } },
  effects,
  keyframes
})

/**
 * Every frame of every window: what the player computes for it (lookAt, offsetAt) against what the
 * encoder's expressions give on the same frame. This is the whole promise of "what you see is what
 * you export".
 */
function compare(segments: Array<{ start: number; end: number }>, drawing: Annotation): number {
  const timeline = compileRenderTimeline(
    segments.map((segment) => ({ sourcePath: 'a.mp4', ...segment })),
    [{ id: drawing.id, sourcePath: 'a.mp4', start: drawing.start, end: drawing.end }],
    1 / FPS
  )
  const fx: RenderEffects = { start: drawing.start, end: drawing.end, list: drawing.effects ?? [], center: CENTRE }
  const motion = drawing.keyframes && drawing.keyframes.length >= 2 ? drawing.keyframes : undefined
  const look = overlayLook(timeline.overlays, motion, fx, { width: WIDTH, height: HEIGHT, half: HALF })
  let compared = 0

  for (const window of timeline.overlays) {
    const first = Math.ceil((window.start - HALF) * FPS - 1e-6)
    const last = Math.ceil((window.end - HALF) * FPS - 1e-6) - 1
    for (let frame = first; frame <= last; frame++) {
      const clip = frame * (1 / FPS)
      const source = window.sourceStart + (clip - window.start)
      const expected = lookAt(drawing, source)
      const moved = motion ? offsetAt(drawing, source) : { dx: 0, dy: 0 }
      const label = `frame ${frame} (fuente ${source.toFixed(3)})`

      if (look.opacity !== null) expect(evaluateExpression(look.opacity, { T: clip }), `opacidad en ${label}`).toBeCloseTo(expected.opacity, 3)
      if (look.scale !== null) expect(evaluateExpression(look.scale, { t: clip }), `escala en ${label}`).toBeCloseTo(expected.scale, 3)
      // The image grows from its corner: the middle of the shape is put back where it was.
      const x = (expected.dx + moved.dx) * WIDTH + CENTRE.x * WIDTH * (1 - expected.scale)
      const y = (expected.dy + moved.dy) * HEIGHT + CENTRE.y * HEIGHT * (1 - expected.scale)
      expect(evaluateExpression(look.x, { t: clip }), `x en ${label}`).toBeCloseTo(x, 1)
      expect(evaluateExpression(look.y, { t: clip }), `y en ${label}`).toBeCloseTo(y, 1)
      compared++
    }
  }
  return compared
}

describe('overlay expressions follow the player', () => {
  it('every effect at once, across a whole drawing', () => {
    expect(compare([{ start: 50, end: 60 }], annotation(52, 57, EVERYTHING))).toBe(150)
  })

  it('each effect on its own', () => {
    for (const effect of EVERYTHING) expect(compare([{ start: 50, end: 60 }], annotation(52, 55, [effect]))).toBe(90)
  })

  it('a drawing cut by the montage, shown in two windows', () => {
    // 50–54 and 56–60 of the same recording: the drawing (51–58) is on screen in both, with a gap in between.
    expect(compare([{ start: 50, end: 54 }, { start: 56, end: 60 }], annotation(51, 58, EVERYTHING))).toBe(150)
  })

  it('a cut that begins in the middle of a fade carries on from where it was', () => {
    // The montage starts 0.4 s into a 1 s fade-in: the first frame is already at 40%, not at zero.
    const drawing = annotation(51, 55, [{ kind: 'fadeIn', duration: 1 }])
    const timeline = compileRenderTimeline([{ sourcePath: 'a.mp4', start: 51.4, end: 56 }], [{ id: 'd1', sourcePath: 'a.mp4', start: 51, end: 55 }], 1 / FPS)
    const look = overlayLook(timeline.overlays, undefined, { start: 51, end: 55, list: drawing.effects ?? [], center: CENTRE }, { width: WIDTH, height: HEIGHT, half: HALF })
    const first = Math.ceil((timeline.overlays[0].start - HALF) * FPS - 1e-6)
    expect(evaluateExpression(look.opacity ?? '1', { T: first / FPS })).toBeCloseTo(0.4, 1)
  })

  it('keyframe motion and effects together', () => {
    const keyframes = [
      { time: 52, dx: 0, dy: 0 },
      { time: 54, dx: 0.3, dy: -0.2 },
      { time: 56, dx: 0.1, dy: 0.1 }
    ]
    expect(compare([{ start: 50, end: 60 }], annotation(52, 56, EVERYTHING, keyframes))).toBe(120)
  })

  it('slides and nothing else: no frames, no scaling, no fading', () => {
    const fx: RenderEffects = { start: 52, end: 55, list: [{ kind: 'slideIn', duration: 0.5, side: 'right' }], center: CENTRE }
    expect(needsFrames(fx)).toBe(false)
    const timeline = compileRenderTimeline([{ sourcePath: 'a.mp4', start: 50, end: 60 }], [{ id: 'd1', sourcePath: 'a.mp4', start: 52, end: 55 }], 1 / FPS)
    const look = overlayLook(timeline.overlays, undefined, fx, { width: WIDTH, height: HEIGHT, half: HALF })
    expect(look.scale).toBeNull()
    expect(look.opacity).toBeNull()
    expect(look.y).toBe('0')
  })
})

describe('validEffects', () => {
  const good: RenderEffects = { start: 1, end: 3, list: [{ kind: 'fadeIn', duration: 1 }], center: { x: 0.5, y: 0.5 } }

  it('lets good effects through and tidies the list', () => {
    expect(validEffects(good)).toEqual(good)
    const messy = validEffects({ ...good, list: [{ kind: 'fadeIn', duration: 1 }, { kind: 'fadeIn', duration: 2 }, { kind: 'bogus' }] as never })
    expect(messy?.list).toEqual([{ kind: 'fadeIn', duration: 1 }])
  })

  it('drops everything when nothing usable is left or a number is not one', () => {
    expect(validEffects(undefined)).toBeUndefined()
    expect(validEffects({ ...good, list: [] })).toBeUndefined()
    expect(validEffects({ ...good, list: [{ kind: 'bogus' }] as never })).toBeUndefined()
    expect(validEffects({ ...good, start: Number.NaN })).toBeUndefined()
    expect(validEffects({ ...good, center: { x: '0.5', y: 0.5 } as never })).toBeUndefined()
    expect(validEffects({ ...good, center: undefined as never })).toBeUndefined()
  })
})
