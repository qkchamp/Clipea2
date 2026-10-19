/** Position inside the video frame, 0..1 on both axes, so drawings survive any output resolution. */
export interface Point {
  x: number
  y: number
}

export interface StrokeStyle {
  color: string
  /** Line width as a fraction of the frame height. */
  width: number
}

export type Shape =
  | { kind: 'pen'; points: Point[]; style: StrokeStyle }
  | { kind: 'arrow' | 'rect' | 'ellipse'; from: Point; to: Point; style: StrokeStyle }
  | { kind: 'text'; at: Point; text: string; style: StrokeStyle }

export type ShapeKind = Shape['kind']

/** Drawing pinned to one frame of a recording. */
export interface Annotation {
  id: string
  sourcePath: string
  /** Start time of the annotated frame, in seconds of the source video. */
  time: number
  /** Seconds the drawing stays on screen while the video keeps playing. */
  showFor: number
  /** Seconds the video freezes on the annotated frame (0 = no freeze). */
  freezeFor: number
  shapes: Shape[]
}

export const DEFAULT_SHOW_FOR = 2
export const SAME_FRAME_TOLERANCE = 1e-3

export function annotationsForSource(annotations: readonly Annotation[], sourcePath: string): Annotation[] {
  return annotations.filter((annotation) => annotation.sourcePath === sourcePath).sort((a, b) => a.time - b.time)
}

export function findAnnotationAt(
  annotations: readonly Annotation[],
  sourcePath: string,
  frameTime: number
): Annotation | undefined {
  return annotations.find(
    (annotation) =>
      annotation.sourcePath === sourcePath && Math.abs(annotation.time - frameTime) < SAME_FRAME_TOLERANCE
  )
}

/** Visible from its frame until `showFor` seconds later (at least one frame). */
export function isVisibleAt(annotation: Annotation, time: number, frameDuration: number): boolean {
  const from = annotation.time - frameDuration / 2
  const until = annotation.time + Math.max(annotation.showFor, frameDuration)
  return time >= from && time < until
}

export function visibleAnnotations(
  annotations: readonly Annotation[],
  sourcePath: string,
  time: number,
  frameDuration: number
): Annotation[] {
  return annotations.filter(
    (annotation) => annotation.sourcePath === sourcePath && isVisibleAt(annotation, time, frameDuration)
  )
}

interface NewAnnotation {
  id: string
  sourcePath: string
  time: number
  showFor: number
  freezeFor: number
}

/** Adds a shape to the drawing on that frame, creating the drawing if needed. */
export function addShape(annotations: readonly Annotation[], target: NewAnnotation, shape: Shape): Annotation[] {
  const existing = findAnnotationAt(annotations, target.sourcePath, target.time)
  if (existing) {
    return annotations.map((annotation) =>
      annotation.id === existing.id ? { ...annotation, shapes: [...annotation.shapes, shape] } : annotation
    )
  }
  return [...annotations, { ...target, shapes: [shape] }]
}

/** Ctrl+Z while drawing: drops the last shape and the drawing itself once empty. */
export function undoLastShape(annotations: readonly Annotation[], id: string): Annotation[] {
  return annotations
    .map((annotation) => (annotation.id === id ? { ...annotation, shapes: annotation.shapes.slice(0, -1) } : annotation))
    .filter((annotation) => annotation.shapes.length > 0)
}

export function updateTiming(
  annotations: readonly Annotation[],
  id: string,
  timing: Partial<Pick<Annotation, 'showFor' | 'freezeFor'>>
): Annotation[] {
  return annotations.map((annotation) => (annotation.id === id ? { ...annotation, ...timing } : annotation))
}

export function removeAnnotation(annotations: readonly Annotation[], id: string): Annotation[] {
  return annotations.filter((annotation) => annotation.id !== id)
}

/** The freeze the playhead runs into when moving from `previous` to `current` while playing. */
export function freezeCrossed(
  annotations: readonly Annotation[],
  sourcePath: string,
  previous: number,
  current: number
): Annotation | undefined {
  if (current <= previous) return undefined
  return annotations
    .filter(
      (annotation) =>
        annotation.sourcePath === sourcePath &&
        annotation.freezeFor > 0 &&
        annotation.time > previous + 1e-4 &&
        annotation.time <= current + 1e-4
    )
    .sort((a, b) => a.time - b.time)[0]
}

/**
 * Moves the drawings of a video onto exact frame start times. Drawings made before the frame
 * table loaded were pinned with the nominal rate; once the table arrives they would no longer match
 * any frame. Two drawings that land on the same frame become one. Returns the same array when
 * nothing moved.
 */
export function snapToFrames(
  annotations: readonly Annotation[],
  sourcePath: string,
  frameStart: (time: number) => number
): readonly Annotation[] {
  let changed = false
  const result: Annotation[] = []
  for (const annotation of annotations) {
    if (annotation.sourcePath !== sourcePath) {
      result.push(annotation)
      continue
    }
    const time = frameStart(annotation.time + SAME_FRAME_TOLERANCE / 2)
    const moved = Math.abs(time - annotation.time) >= SAME_FRAME_TOLERANCE / 10
    const twin = result.find((other) => other.sourcePath === sourcePath && Math.abs(other.time - time) < SAME_FRAME_TOLERANCE)
    if (twin) {
      result[result.indexOf(twin)] = { ...twin, shapes: [...twin.shapes, ...annotation.shapes] }
      changed = true
    } else {
      result.push(moved ? { ...annotation, time } : annotation)
      changed ||= moved
    }
  }
  return changed ? result : annotations
}
