import { describe, expect, it } from 'vitest'
import {
  addShape,
  freezeCrossed,
  isVisibleAt,
  snapToFrames,
  undoLastShape,
  updateTiming,
  visibleAnnotations,
  type Annotation,
  type Shape
} from './annotation'

const arrow: Shape = { kind: 'arrow', from: { x: 0.1, y: 0.1 }, to: { x: 0.5, y: 0.5 }, style: { color: '#ff0', width: 0.007 } }
const target = { id: 'n1', sourcePath: 'a.mp4', time: 10, showFor: 2, freezeFor: 0 }
const frame = 1 / 30

describe('drawing on a frame', () => {
  it('creates a drawing for the frame and stacks later shapes on it', () => {
    const first = addShape([], target, arrow)
    const second = addShape(first, { ...target, id: 'n2' }, arrow)
    expect(second).toHaveLength(1)
    expect(second[0].shapes).toHaveLength(2)
  })

  it('keeps separate drawings for different frames or videos', () => {
    const list = addShape(addShape([], target, arrow), { ...target, id: 'n2', time: 10 + frame }, arrow)
    expect(addShape(list, { ...target, id: 'n3', sourcePath: 'b.mp4' }, arrow)).toHaveLength(3)
  })

  it('undoes shapes and removes empty drawings', () => {
    const list = addShape([], target, arrow)
    expect(undoLastShape(list, 'n1')).toEqual([])
  })

  it('updates show and freeze times', () => {
    const list = updateTiming(addShape([], target, arrow), 'n1', { freezeFor: 1.5 })
    expect(list[0].freezeFor).toBe(1.5)
  })
})

describe('visibility', () => {
  const annotation: Annotation = { ...target, shapes: [arrow] }

  it('shows from its frame for showFor seconds', () => {
    expect(isVisibleAt(annotation, 9.9, frame)).toBe(false)
    expect(isVisibleAt(annotation, 10, frame)).toBe(true)
    expect(isVisibleAt(annotation, 11.99, frame)).toBe(true)
    expect(isVisibleAt(annotation, 12, frame)).toBe(false)
  })

  it('stays at least one frame', () => {
    expect(isVisibleAt({ ...annotation, showFor: 0 }, 10 + frame / 2, frame)).toBe(true)
  })

  it('filters by video', () => {
    expect(visibleAnnotations([annotation], 'b.mp4', 10, frame)).toEqual([])
  })
})

describe('freezeCrossed', () => {
  const freeze: Annotation = { ...target, freezeFor: 2, shapes: [arrow] }

  it('triggers when playback runs over the frame', () => {
    expect(freezeCrossed([freeze], 'a.mp4', 9.98, 10.01)?.id).toBe('n1')
  })

  it('does not retrigger once playback resumes from that frame', () => {
    expect(freezeCrossed([freeze], 'a.mp4', 10, 10.03)).toBeUndefined()
  })

  it('ignores drawings without freeze and backwards jumps', () => {
    expect(freezeCrossed([{ ...freeze, freezeFor: 0 }], 'a.mp4', 9.98, 10.01)).toBeUndefined()
    expect(freezeCrossed([freeze], 'a.mp4', 10.5, 9)).toBeUndefined()
  })
})

describe('snapToFrames', () => {
  const style = { color: '#fff', width: 0.007 }
  const shape = { kind: 'rect' as const, from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, style }
  const make = (id: string, time: number, sourcePath = 'a.mp4'): Annotation => ({ id, sourcePath, time, showFor: 2, freezeFor: 0, shapes: [shape] })
  const frames = [0, 0.031, 0.069, 0.1]
  const frameStart = (time: number): number => [...frames].reverse().find((start) => start <= time) ?? 0

  it('moves drawings pinned with the nominal rate onto the real frames', () => {
    const snapped = snapToFrames([make('x', 2 / 30), make('y', 1, 'b.mp4')], 'a.mp4', frameStart)
    expect(snapped[0].time).toBeCloseTo(0.031)
    expect(snapped[1].time).toBe(1)
  })

  it('merges drawings that end up on the same frame and keeps the array when nothing moves', () => {
    const merged = snapToFrames([make('x', 0.031), make('y', 0.035)], 'a.mp4', frameStart)
    expect(merged).toHaveLength(1)
    expect(merged[0].shapes).toHaveLength(2)
    const exact = [make('x', 0.069)]
    expect(snapToFrames(exact, 'a.mp4', frameStart)).toBe(exact)
  })
})
