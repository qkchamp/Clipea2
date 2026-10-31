import { create } from 'zustand'
import { createId } from '@shared/domain/id'
import {
  changeAnnotation,
  keyframeAt,
  moveOnFrame,
  offsetAt,
  removeAnnotation,
  removeKeyframe,
  reshapeOnFrame,
  retime,
  setKeyframe,
  type Annotation,
  type Shape,
  type ShapeKind
} from '../domain/annotation'
import { clampDuration, clampRate, removeEffect, setEffect, type Effect, type EffectKind } from '../domain/effects'

export const DRAW_COLORS = ['#ff3b30', '#ffd60a', '#34c759', '#0ab4ff', '#ffffff', '#ff2daa'] as const
export const DRAW_WIDTHS = [
  { value: 0.004, name: 'thin' },
  { value: 0.007, name: 'medium' },
  { value: 0.012, name: 'thick' }
] as const

/** The shapes plus the cursor, which picks drawings to move them or edit a text. */
export type DrawTool = ShapeKind | 'select'

const HEX_COLOR = /^#[0-9a-f]{6}$/i

interface AnnotationState {
  annotations: Annotation[]
  drawing: boolean
  tool: DrawTool
  color: string
  /** The one color the user mixes by hand (the swatch after the fixed ones); null until they do. */
  customColor: string | null
  width: number
  /** Drawing picked with the cursor or on its bar in the timeline. */
  selectedId: string | null

  setDrawing(drawing: boolean): void
  setTool(tool: DrawTool): void
  setColor(color: string): void
  /** Sets the custom color and starts drawing with it; null empties it (and leaves it if it was the color in use). */
  setCustomColor(color: string | null): void
  setWidth(width: number): void
  select(id: string | null): void
  add(sourcePath: string, start: number, end: number, shape: Shape): void
  /** Dragged with the cursor on the frame at `time` (an animated drawing gets a keyframe there). */
  move(id: string, dx: number, dy: number, time: number): void
  /** Resized with the cursor: `shape` is how it looks on screen on the frame at `time`. */
  reshape(id: string, shape: Shape, time: number): void
  /** An empty text deletes the drawing. */
  setText(id: string, text: string): void
  /** `carryKeyframes`: the whole bar moved, so its animation moves with it. */
  setTimes(id: string, start: number, end: number, carryKeyframes: boolean): void
  /** Adds a keyframe where the drawing is on that frame, or removes the one already there. */
  toggleKeyframe(id: string, time: number): void
  /** Turns an effect on, or changes it (a drawing has at most one effect of each kind). */
  setEffect(id: string, effect: Effect): void
  removeEffect(id: string, kind: EffectKind): void
  remove(id: string): void
  replaceAll(annotations: Annotation[]): void
}

export const useAnnotationStore = create<AnnotationState>((set, get) => ({
  annotations: [],
  drawing: false,
  tool: 'arrow',
  color: DRAW_COLORS[0],
  customColor: null,
  width: DRAW_WIDTHS[1].value,
  selectedId: null,

  setDrawing: (drawing) => set({ drawing }),
  setTool: (tool) => set({ tool }),
  setColor: (color) => set({ color }),
  setCustomColor(color) {
    if (color === null) {
      const { customColor, color: inUse } = get()
      return set({ customColor: null, color: inUse === customColor ? DRAW_COLORS[0] : inUse })
    }
    if (!HEX_COLOR.test(color)) return
    const hex = color.toLowerCase()
    set({ customColor: hex, color: hex })
  },
  setWidth: (width) => set({ width }),
  select: (selectedId) => set({ selectedId }),

  add(sourcePath, start, end, shape) {
    set({ annotations: [...get().annotations, { id: createId(), sourcePath, start, end, shape }] })
  },

  move: (id, dx, dy, time) => set({ annotations: changeAnnotation(get().annotations, id, (annotation) => moveOnFrame(annotation, time, dx, dy)) }),

  reshape: (id, shape, time) => set({ annotations: changeAnnotation(get().annotations, id, (annotation) => reshapeOnFrame(annotation, time, shape)) }),

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

  setEffect(id, effect) {
    const change = (annotation: Annotation): Annotation => {
      const valid =
        'duration' in effect
          ? { ...effect, duration: clampDuration(effect.duration, annotation.end - annotation.start) }
          : { ...effect, rate: clampRate(effect.rate) }
      return { ...annotation, effects: setEffect(annotation.effects, valid) }
    }
    set({ annotations: changeAnnotation(get().annotations, id, change) })
  },

  removeEffect(id, kind) {
    const change = (annotation: Annotation): Annotation => {
      const effects = removeEffect(annotation.effects, kind)
      return { ...annotation, effects: effects.length > 0 ? effects : undefined }
    }
    set({ annotations: changeAnnotation(get().annotations, id, change) })
  },

  remove(id) {
    set({ annotations: removeAnnotation(get().annotations, id), selectedId: get().selectedId === id ? null : get().selectedId })
  },

  replaceAll(annotations) {
    const { selectedId } = get()
    set({ annotations, selectedId: annotations.some((annotation) => annotation.id === selectedId) ? selectedId : null })
  }
}))
