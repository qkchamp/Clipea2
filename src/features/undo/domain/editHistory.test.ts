import { describe, expect, it } from 'vitest'
import type { Annotation } from '@features/annotations/domain/annotation'
import type { Segment } from '@features/montage/domain/montage'
import { describeChange, EMPTY_HISTORY, isDestructive, MAX_UNDO, record, redo, undo, type EditSnapshot } from './editHistory'

const segment = (id: string, start = 0): Segment => ({ id, sourcePath: 'a.mp4', sourceLabel: 'A', start, end: start + 5 })
const drawing = (id: string): Annotation => ({ id, sourcePath: 'a.mp4', time: 1, showFor: 2, freezeFor: 0, shapes: [] })
const snap = (segments: Segment[], annotations: Annotation[] = []): EditSnapshot => ({ segments, annotations })

describe('edit history', () => {
  it('undoes and redoes in order', () => {
    const s0 = snap([])
    const s1 = snap([segment('a')])
    const s2 = snap([segment('a'), segment('b')])
    let history = record(record(EMPTY_HISTORY, s0), s1)
    const first = undo(history, s2)!
    expect(first.snapshot).toBe(s1)
    history = first.history
    const second = undo(history, s1)!
    expect(second.snapshot).toBe(s0)
    const again = redo(second.history, s0)!
    expect(again.snapshot).toBe(s1)
    expect(undo(EMPTY_HISTORY, s0)).toBeNull()
    expect(redo(EMPTY_HISTORY, s0)).toBeNull()
  })

  it('drops redo after a new change and keeps at most MAX_UNDO steps', () => {
    let history = EMPTY_HISTORY
    for (let i = 0; i < MAX_UNDO + 10; i++) history = record(history, snap([]))
    expect(history.past).toHaveLength(MAX_UNDO)
    const undone = undo(history, snap([]))!
    expect(record(undone.history, snap([])).future).toEqual([])
  })
})

describe('describeChange', () => {
  const a = segment('a')
  const b = segment('b', 10)
  it('names montage changes', () => {
    expect(describeChange(snap([a]), snap([a, b]))).toBe('segment-added')
    expect(describeChange(snap([a, b]), snap([a]))).toBe('segment-removed')
    expect(describeChange(snap([a, b]), snap([]))).toBe('montage-cleared')
    expect(describeChange(snap([a, b]), snap([b, a]))).toBe('montage-reordered')
    expect(describeChange(snap([a]), snap([{ ...a, end: 9 }]))).toBe('segment-edited')
    expect(describeChange(snap([a]), snap([b]))).toBe('montage-replaced')
  })

  it('names drawing changes and flags the ones that lose work', () => {
    const segments: Segment[] = []
    expect(describeChange(snap(segments, [drawing('x')]), snap(segments, []))).toBe('drawing-removed')
    expect(describeChange(snap(segments, []), snap(segments, [drawing('x')]))).toBe('drawing-added')
    expect(isDestructive('drawing-removed')).toBe(true)
    expect(isDestructive('segment-added')).toBe(false)
  })
})
