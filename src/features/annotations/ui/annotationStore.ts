import { create } from 'zustand'
import { createId } from '@shared/domain/id'
import {
  addShape,
  DEFAULT_SHOW_FOR,
  findAnnotationAt,
  removeAnnotation,
  undoLastShape,
  updateTiming,
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

interface AnnotationState {
  annotations: Annotation[]
  drawing: boolean
  tool: ShapeKind
  color: string
  width: number
  /** Defaults for the next drawing; also edit the drawing on the current frame. */
  showFor: number
  freezeFor: number

  setDrawing(drawing: boolean): void
  setTool(tool: ShapeKind): void
  setColor(color: string): void
  setWidth(width: number): void
  setShowFor(seconds: number, activeId?: string): void
  setFreezeFor(seconds: number, activeId?: string): void
  addShape(sourcePath: string, frameTime: number, shape: Shape): void
  undo(sourcePath: string, frameTime: number): void
  remove(id: string): void
  replaceAll(annotations: Annotation[]): void
}

export const useAnnotationStore = create<AnnotationState>((set, get) => ({
  annotations: [],
  drawing: false,
  tool: 'arrow',
  color: DRAW_COLORS[0],
  width: DRAW_WIDTHS[1].value,
  showFor: DEFAULT_SHOW_FOR,
  freezeFor: 0,

  setDrawing: (drawing) => set({ drawing }),
  setTool: (tool) => set({ tool }),
  setColor: (color) => set({ color }),
  setWidth: (width) => set({ width }),

  setShowFor(showFor, activeId) {
    set({ showFor })
    if (activeId) set({ annotations: updateTiming(get().annotations, activeId, { showFor }) })
  },

  setFreezeFor(freezeFor, activeId) {
    set({ freezeFor })
    if (activeId) set({ annotations: updateTiming(get().annotations, activeId, { freezeFor }) })
  },

  addShape(sourcePath, frameTime, shape) {
    const { annotations, showFor, freezeFor } = get()
    set({ annotations: addShape(annotations, { id: createId(), sourcePath, time: frameTime, showFor, freezeFor }, shape) })
  },

  undo(sourcePath, frameTime) {
    const target = findAnnotationAt(get().annotations, sourcePath, frameTime)
    if (target) set({ annotations: undoLastShape(get().annotations, target.id) })
  },

  remove: (id) => set({ annotations: removeAnnotation(get().annotations, id) }),
  replaceAll: (annotations) => set({ annotations })
}))
