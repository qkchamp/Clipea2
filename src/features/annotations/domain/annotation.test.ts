import { describe, expect, it } from 'vitest'
import {
  annotationLabel,
  assignLanes,
  changeAnnotation,
  groupSameTimes,
  isAnimated,
  isVisibleAt,
  migrateAnnotations,
  moveOnFrame,
  offsetAt,
  removeKeyframe,
  reshapeOnFrame,
  retime,
  setKeyframe,
  shapeOnFrame,
  snapToFrames,
  translateShape,
  visibleAnnotations,
  type Annotation,
  type Shape
} from './annotation'

const style = { color: '#ff0', width: 0.007 }
const arrow: Shape = { kind: 'arrow', from: { x: 0.1, y: 0.1 }, to: { x: 0.5, y: 0.5 }, style }
const drawing: Annotation = { id: 'n1', sourcePath: 'a.mp4', start: 10, end: 12, shape: arrow }
const frame = 1 / 30

describe('visibility', () => {
  it('shows from its first frame until its end', () => {
    expect(isVisibleAt(drawing, 9.9, frame)).toBe(false)
    expect(isVisibleAt(drawing, 10, frame)).toBe(true)
    expect(isVisibleAt(drawing, 12 - frame, frame)).toBe(true)
    expect(isVisibleAt(drawing, 12, frame)).toBe(false)
  })

  it('stays at least one frame', () => {
    expect(isVisibleAt({ ...drawing, end: 10 }, 10, frame)).toBe(true)
    expect(isVisibleAt({ ...drawing, end: 10 }, 10 + frame, frame)).toBe(false)
  })

  it('filters by video', () => {
    expect(visibleAnnotations([drawing], 'b.mp4', 10, frame)).toEqual([])
  })
})

describe('editing', () => {
  it('changes the times of one drawing only', () => {
    const list = changeAnnotation([drawing, { ...drawing, id: 'n2' }], 'n1', (annotation) => retime(annotation, 11, 15, false))
    expect([list[0].start, list[0].end, list[1].end]).toEqual([11, 15, 12])
  })

  it('moves every point of a shape', () => {
    const moved = translateShape(arrow, 0.1, -0.05)
    expect(moved).toMatchObject({ from: { x: 0.2, y: 0.05 }, to: { x: 0.6, y: 0.45 } })
    expect(translateShape({ kind: 'text', at: { x: 0.5, y: 0.5 }, text: 'hola', style }, 0.1, 0.1)).toMatchObject({ at: { x: 0.6, y: 0.6 } })
  })

  it('names drawings by shape, texts by what they say', () => {
    expect(annotationLabel(drawing)).toBe('Flecha')
    expect(annotationLabel({ ...drawing, shape: { kind: 'text', at: { x: 0, y: 0 }, text: 'ojo acá', style } })).toBe('ojo acá')
  })
})

describe('groupSameTimes', () => {
  it('joins drawings of the same video with the same times, in drawing order', () => {
    const a = { ...drawing, id: 'a' }
    const b = { ...drawing, id: 'b', end: 13 }
    const c = { ...drawing, id: 'c' }
    const d = { ...drawing, id: 'd', sourcePath: 'b.mp4' }
    expect(groupSameTimes([a, b, c, d]).map((group) => group.map((item) => item.id))).toEqual([['a', 'c'], ['b'], ['d']])
  })
})

describe('keyframes', () => {
  const animated = setKeyframe(setKeyframe(drawing, { time: 10, dx: 0, dy: 0 }), { time: 11, dx: 0.2, dy: -0.1 })

  it('glides between keyframes and holds before the first and after the last', () => {
    expect(isAnimated(animated)).toBe(true)
    expect(offsetAt(animated, 9)).toEqual({ dx: 0, dy: 0 })
    const middle = offsetAt(animated, 10.5)
    expect([middle.dx, middle.dy]).toEqual([expect.closeTo(0.1), expect.closeTo(-0.05)])
    expect(offsetAt(animated, 11.9)).toEqual({ dx: 0.2, dy: -0.1 })
    expect(shapeOnFrame(animated, 11)).toMatchObject({ from: { x: expect.closeTo(0.3), y: expect.closeTo(0) } })
  })

  it('keeps one keyframe per frame, sorted', () => {
    const replaced = setKeyframe(setKeyframe(animated, { time: 10.5, dx: 1, dy: 1 }), { time: 10.5 + 1e-4, dx: 2, dy: 2 })
    expect(replaced.keyframes?.map((keyframe) => [keyframe.time, keyframe.dx])).toEqual([
      [10, 0],
      [10.5 + 1e-4, 2],
      [11, 0.2]
    ])
  })

  it('moving with the cursor adds a keyframe on an animated drawing and moves a still one', () => {
    const moved = moveOnFrame(animated, 10.5, 0.1, 0)
    expect(moved.keyframes).toHaveLength(3)
    expect(moved.keyframes?.[1]).toMatchObject({ time: 10.5, dx: expect.closeTo(0.2), dy: expect.closeTo(-0.05) })
    const still = moveOnFrame(drawing, 10.5, 0.1, 0)
    expect(still.shape).toMatchObject({ from: { x: expect.closeTo(0.2) } })
    expect(still.keyframes).toBeUndefined()
  })

  it('removing the last keyframe leaves the drawing where it was', () => {
    const single = setKeyframe(drawing, { time: 10, dx: 0.1, dy: 0 })
    expect(isAnimated(single)).toBe(false)
    const still = removeKeyframe(single, 10)
    expect(still.keyframes).toBeUndefined()
    expect(still.shape).toMatchObject({ from: { x: expect.closeTo(0.2) } })
  })

  it('moving the bar carries the keyframes, stretching it does not', () => {
    expect(retime(animated, 12, 14, true).keyframes?.map((keyframe) => keyframe.time)).toEqual([12, 13])
    expect(retime(animated, 9, 14, false).keyframes?.map((keyframe) => keyframe.time)).toEqual([10, 11])
  })

  it('never groups an animated drawing with others for the export', () => {
    expect(groupSameTimes([animated, { ...animated, id: 'n2', keyframes: undefined }, { ...drawing, id: 'n3' }])).toHaveLength(2)
  })

  it('stores a resize done on screen as drawn, keeping the keyframe offsets', () => {
    const resizedOnScreen: Shape = { kind: 'arrow', from: { x: 0.2, y: 0.1 }, to: { x: 0.9, y: 0.6 }, style }
    // Halfway through, the drawing is shifted by (0.1, -0.05): its stored shape sits before that shift.
    const stored = reshapeOnFrame(animated, 10.5, resizedOnScreen).shape
    expect(stored).toMatchObject({ from: { x: expect.closeTo(0.1), y: expect.closeTo(0.15) }, to: { x: expect.closeTo(0.8), y: expect.closeTo(0.65) } })
    expect(shapeOnFrame(reshapeOnFrame(animated, 10.5, resizedOnScreen), 10.5)).toMatchObject({ to: { x: expect.closeTo(0.9), y: expect.closeTo(0.6) } })
    expect(reshapeOnFrame(drawing, 10, resizedOnScreen).shape).toEqual(resizedOnScreen)
  })
})

describe('effects on drawings', () => {
  it('never groups a drawing with effects with others for the export', () => {
    const faded: Annotation = { ...drawing, id: 'n2', effects: [{ kind: 'fadeIn', duration: 0.5 }] }
    expect(groupSameTimes([drawing, faded, { ...drawing, id: 'n3' }]).map((group) => group.map((item) => item.id))).toEqual([['n1', 'n3'], ['n2']])
  })

  it('keeps the effects of a bar that moves, only its times change', () => {
    const faded: Annotation = { ...drawing, effects: [{ kind: 'fadeOut', duration: 1 }] }
    expect(retime(faded, 20, 25, true).effects).toEqual([{ kind: 'fadeOut', duration: 1 }])
  })
})

describe('assignLanes', () => {
  it('puts overlapping drawings on separate rows and reuses free rows', () => {
    expect(
      assignLanes([
        { start: 0, end: 2 },
        { start: 1, end: 3 },
        { start: 2, end: 4 },
        { start: 1.5, end: 5 }
      ])
    ).toEqual([0, 1, 0, 2])
  })
})

describe('migrateAnnotations', () => {
  it('splits an old frame drawing into one drawing per shape and drops the freeze', () => {
    const old = { id: 'old', sourcePath: 'a.mp4', time: 4, showFor: 3, freezeFor: 1, shapes: [arrow, arrow] }
    expect(migrateAnnotations([old])).toEqual([
      { id: 'old', sourcePath: 'a.mp4', start: 4, end: 7, shape: arrow },
      { id: 'old-1', sourcePath: 'a.mp4', start: 4, end: 7, shape: arrow }
    ])
  })

  it('keeps current drawings and skips broken entries', () => {
    expect(migrateAnnotations([drawing, null, { id: 'x' }])).toEqual([drawing])
  })

  it('cleans the effects of saved drawings: invalid ones go, a list left empty disappears', () => {
    const [cleaned] = migrateAnnotations([{ ...drawing, effects: [{ kind: 'fadeIn', duration: 0.5 }, { kind: 'fadeOut' }, 'boom'] }])
    expect(cleaned.effects).toEqual([{ kind: 'fadeIn', duration: 0.5 }])
    const [none] = migrateAnnotations([{ ...drawing, effects: 'fadeIn' }])
    expect(none.effects).toBeUndefined()
  })
})

describe('snapToFrames', () => {
  const make = (id: string, start: number, sourcePath = 'a.mp4'): Annotation => ({ id, sourcePath, start, end: start + 2, shape: arrow })
  const frames = [0, 0.031, 0.069, 0.1]
  const frameStart = (time: number): number => [...frames].reverse().find((start) => start <= time) ?? 0

  it('moves drawings pinned with the nominal rate onto the real frames, keeping their length', () => {
    const snapped = snapToFrames([make('x', 2 / 30), make('y', 1, 'b.mp4')], 'a.mp4', frameStart)
    expect(snapped[0].start).toBeCloseTo(0.031)
    expect(snapped[0].end - snapped[0].start).toBeCloseTo(2)
    expect(snapped[1].start).toBe(1)
  })

  it('keeps the array when nothing moves', () => {
    const exact = [make('x', 0.069)]
    expect(snapToFrames(exact, 'a.mp4', frameStart)).toBe(exact)
  })
})
