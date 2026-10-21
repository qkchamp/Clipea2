import { create } from 'zustand'
import { createId } from '@shared/domain/id'
import {
  changeAnnotation,
  keyframeAt,
  moveOnFrame,
  offsetAt,
  removeAnnotation,
  removeKeyframe,
  retime,
  setKeyframe,
  type Annotation,
  type Shape,
  type ShapeKind
} from '../domain/annotation'

export const DRAW_COLORS = ['#ff3b30', '#ffd60a', '#34c759', '#0ab4ff', '#ffffff', '#ff2daa'] as const
export const DRAW_WIDTHS = [
  { value: 0.004, label: 'Fino' },
  { value: 0.007, label: 'Medio' },
  { value: 0.012, label: 'Grueso' }
] as const

/** The shapes plus the cursor, which picks drawings to move them or edit a text. */
export type DrawTool = ShapeKind | 'select'

interface AnnotationState {
  annotations: Annotation[]
  drawing: boolean
  tool: DrawTool
  color: string
  width: number
  /** Drawing picked with the cursor or on its bar in the timeline. */
  selectedId: string | null

  setDrawing(drawing: boolean): void
  setTool(tool: DrawTool): void
  setColor(color: string): void
  setWidth(width: number): void
  select(id: string | null): void
  add(sourcePath: string, start: number, end: number, shape: Shape): void
  /** Dragged with the cursor on the frame at `time` (an animated drawing gets a keyframe there). */
  move(id: string, dx: number, dy: number, time: number): void
  /** An empty text deletes the drawing. */
  setText(id: string, text: string): void
  /** `carryKeyframes`: the whole bar moved, so its animation moves with it. */
  setTimes(id: string, start: number, end: number, carryKeyframes: boolean): void
  /** Adds a keyframe where the drawing is on that frame, or removes the one already there. */
  toggleKeyframe(id: string, time: number): void
  remove(id: string): void
  replaceAll(annotations: Annotation[]): void
}

export const useAnnotationStore = create<AnnotationState>((set, get) => ({
  annotations: [],
  drawing: false,
  tool: 'arrow',
  color: DRAW_COLORS[0],
  width: DRAW_WIDTHS[1].value,
  selectedId: null,

  setDrawing: (drawing) => set({ drawing }),
  setTool: (tool) => set({ tool }),
  setColor: (color) => set({ color }),
  setWidth: (width) => set({ width }),
  select: (selectedId) => set({ selectedId }),

  add(sourcePath, start, end, shape) {
    set({ annotations: [...get().annotations, { id: createId(), sourcePath, start, end, shape }] })
  },

  move: (id, dx, dy, time) => set({ annotations: changeAnnotation(get().annotations, id, (annotation) => moveOnFrame(annotation, time, dx, dy)) }),

  setText(id, text) {
    const target = get().annotations.find((annotation) => annotation.id === id)
    if (target?.shape.kind !== 'text') return
    if (text === '') return get().remove(id)
    const shape = { ...target.shape, text }
    set({ annotations: changeAnnotation(get().annotations, id, (annotation) => ({ ...annotation, shape })) })
  },

  setTimes: (id, start, end, carryKeyframes) =>
    set({ annotations: changeAnnotation(get().annotations, id, (annotation) => retime(annotation, start, end, carryKeyframes)) }),

  toggleKeyframe(id, time) {
    const toggle = (annotation: Annotation): Annotation =>
      keyframeAt(annotation, time) ? removeKeyframe(annotation, time) : setKeyframe(annotation, { time, ...offsetAt(annotation, time) })
    set({ annotations: changeAnnotation(get().annotations, id, toggle) })
  },

  remove(id) {
    set({ annotations: removeAnnotation(get().annotations, id), selectedId: get().selectedId === id ? null : get().selectedId })
  },

  replaceAll(annotations) {
    const { selectedId } = get()
    set({ annotations, selectedId: annotations.some((annotation) => annotation.id === selectedId) ? selectedId : null })
  }
}))
