import { getT } from '@shared/i18n'
import { hasEffects, normalizeEffects, type Effect } from './effects'

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

/** Where an animated drawing is on one frame: how far it moved from the shape as drawn (fractions of the frame). */
export interface Keyframe {
  /** Start time of the frame, in seconds of the source video. */
  time: number
  dx: number
  dy: number
}

/** One shape over a recording, on screen from `start` until `end` (seconds of the source video). */
export interface Annotation {
  id: string
  sourcePath: string
  /** Start time of the first frame that shows it. */
  start: number
  /** Start time of the first frame that no longer shows it. */
  end: number
  shape: Shape
  /** Sorted by time. With two or more the drawing glides from one to the next; before the first and after the last it stays put. */
  keyframes?: Keyframe[]
  /** Fades, zooms, slides and loops; at most one of each kind (see effects.ts). */
  effects?: Effect[]
}

export const DEFAULT_SHOW_FOR = 2
export const SAME_FRAME_TOLERANCE = 1e-3

/** Name on its bar in the timeline: the shape (in the language in use), or what a text says. */
export function annotationLabel(annotation: Annotation): string {
  return annotation.shape.kind === 'text' ? annotation.shape.text : getT().drawing.shapes[annotation.shape.kind]
}

export function annotationsForSource(annotations: readonly Annotation[], sourcePath: string): Annotation[] {
  return annotations.filter((annotation) => annotation.sourcePath === sourcePath).sort((a, b) => a.start - b.start)
}

/**
 * When a new drawing shows: from the frame on screen, for DEFAULT_SHOW_FOR. Near the end of the
 * video that would be cut short, so it ends with the video and reaches back instead (the frame on
 * screen stays inside it). `frameAt` snaps a time to the start of its frame.
 */
export function newDrawingTimes(
  frameStart: number,
  frameDuration: number,
  videoEnd: number,
  frameAt: (time: number) => number
): { start: number; end: number } {
  const end = Math.min(frameStart + DEFAULT_SHOW_FOR, videoEnd)
  const cutShort = end - frameStart < DEFAULT_SHOW_FOR - frameDuration / 2
  const start = cutShort ? Math.min(frameStart, frameAt(Math.max(0, end - DEFAULT_SHOW_FOR + frameDuration / 2))) : frameStart
  return { start, end: Math.max(end, start + frameDuration) }
}

/** Visible from its first frame until `end`, and always for at least one frame. */
export function isVisibleAt(annotation: Annotation, time: number, frameDuration: number): boolean {
  const half = frameDuration / 2
  return time >= annotation.start - half && time < Math.max(annotation.end, annotation.start + frameDuration) - half
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

export function changeAnnotation(
  annotations: readonly Annotation[],
  id: string,
  change: (annotation: Annotation) => Annotation
): Annotation[] {
  return annotations.map((annotation) => (annotation.id === id ? change(annotation) : annotation))
}

export function removeAnnotation(annotations: readonly Annotation[], id: string): Annotation[] {
  return annotations.filter((annotation) => annotation.id !== id)
}

/** Drawings of the same video shown at exactly the same times, in drawing order. Animated ones and ones with effects always go alone. */
export function groupSameTimes(annotations: readonly Annotation[]): Annotation[][] {
  const groups = new Map<string, Annotation[]>()
  for (const annotation of annotations) {
    const alone = isAnimated(annotation) || hasEffects(annotation)
    const key = alone ? annotation.id : `${annotation.sourcePath}|${annotation.start}|${annotation.end}`
    const group = groups.get(key)
    if (group) group.push(annotation)
    else groups.set(key, [annotation])
  }
  return [...groups.values()]
}

/** Same shape moved by a fraction of the frame. */
export function translateShape(shape: Shape, dx: number, dy: number): Shape {
  const move = (point: Point): Point => ({ x: point.x + dx, y: point.y + dy })
  switch (shape.kind) {
    case 'pen':
      return { ...shape, points: shape.points.map(move) }
    case 'text':
      return { ...shape, at: move(shape.at) }
    default:
      return { ...shape, from: move(shape.from), to: move(shape.to) }
  }
}

/** Moves along its keyframes; a drawing with fewer than two always looks the same. */
export function isAnimated(annotation: Annotation): boolean {
  return (annotation.keyframes?.length ?? 0) >= 2
}

const sameFrame = (a: number, b: number): boolean => Math.abs(a - b) < SAME_FRAME_TOLERANCE

export function keyframeAt(annotation: Annotation, time: number): Keyframe | undefined {
  return annotation.keyframes?.find((keyframe) => sameFrame(keyframe.time, time))
}

/** Offset from the shape as drawn at that moment: linear between keyframes, held before the first and after the last. */
export function offsetAt(annotation: Annotation, time: number): { dx: number; dy: number } {
  const keyframes = annotation.keyframes ?? []
  if (keyframes.length === 0) return { dx: 0, dy: 0 }
  const next = keyframes.findIndex((keyframe) => keyframe.time > time)
  if (next === 0) return { dx: keyframes[0].dx, dy: keyframes[0].dy }
  if (next === -1) return { dx: keyframes[keyframes.length - 1].dx, dy: keyframes[keyframes.length - 1].dy }
  const a = keyframes[next - 1]
  const b = keyframes[next]
  const progress = (time - a.time) / (b.time - a.time)
  return { dx: a.dx + (b.dx - a.dx) * progress, dy: a.dy + (b.dy - a.dy) * progress }
}

/** The shape where it is on screen at that moment. */
export function shapeOnFrame(annotation: Annotation, time: number): Shape {
  if (!annotation.keyframes?.length) return annotation.shape
  const { dx, dy } = offsetAt(annotation, time)
  return translateShape(annotation.shape, dx, dy)
}

/** Pins the drawing's position on that frame, replacing a keyframe already there. */
export function setKeyframe(annotation: Annotation, keyframe: Keyframe): Annotation {
  const others = (annotation.keyframes ?? []).filter((existing) => !sameFrame(existing.time, keyframe.time))
  return { ...annotation, keyframes: [...others, keyframe].sort((a, b) => a.time - b.time) }
}

/** Drops the keyframe on that frame; when it was the last one, the drawing stays where it was. */
export function removeKeyframe(annotation: Annotation, time: number): Annotation {
  const target = keyframeAt(annotation, time)
  if (!target) return annotation
  const keyframes = (annotation.keyframes ?? []).filter((keyframe) => keyframe !== target)
  if (keyframes.length > 0) return { ...annotation, keyframes }
  return { ...annotation, shape: translateShape(annotation.shape, target.dx, target.dy), keyframes: undefined }
}

/** Dragged with the cursor on a frame: an animated drawing gets a keyframe there, a still one simply moves. */
export function moveOnFrame(annotation: Annotation, time: number, dx: number, dy: number): Annotation {
  if (!annotation.keyframes?.length) return { ...annotation, shape: translateShape(annotation.shape, dx, dy) }
  const offset = offsetAt(annotation, time)
  return setKeyframe(annotation, { time, dx: offset.dx + dx, dy: offset.dy + dy })
}

/** A shape resized where it is on screen on that frame: it is stored as drawn, before the keyframe offset. */
export function reshapeOnFrame(annotation: Annotation, time: number, onScreen: Shape): Annotation {
  const { dx, dy } = offsetAt(annotation, time)
  return { ...annotation, shape: translateShape(onScreen, -dx, -dy) }
}

/** New times for a drawing; moving the whole bar carries its keyframes along. */
export function retime(annotation: Annotation, start: number, end: number, carryKeyframes: boolean): Annotation {
  const shift = start - annotation.start
  const keyframes =
    carryKeyframes && annotation.keyframes ? annotation.keyframes.map((keyframe) => ({ ...keyframe, time: keyframe.time + shift })) : annotation.keyframes
  return { ...annotation, start, end, keyframes }
}

/**
 * Row of each drawing in the timeline (same order as `items`): drawings that overlap in time go on
 * separate rows, each one in the first row that is free when it starts.
 */
export function assignLanes(items: readonly { start: number; end: number }[]): number[] {
  const order = items.map((_, index) => index).sort((a, b) => items[a].start - items[b].start)
  const laneEnds: number[] = []
  const lanes: number[] = new Array(items.length)
  for (const index of order) {
    const { start, end } = items[index]
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start + 1e-6)
    if (lane === -1) lane = laneEnds.length
    laneEnds[lane] = end
    lanes[index] = lane
  }
  return lanes
}

interface LegacyAnnotation {
  id: string
  sourcePath: string
  time: number
  showFor?: number
  shapes: Shape[]
}

/** Saved files may hold anything: effects that don't make sense are dropped. */
function cleanEffects(annotation: Annotation): Annotation {
  if (annotation.effects === undefined) return annotation
  const effects = normalizeEffects(annotation.effects)
  return { ...annotation, effects: effects.length > 0 ? effects : undefined }
}

/**
 * Sessions and exports saved by older versions grouped every shape of a frame with `time` and
 * `showFor` (and could freeze the image): now each shape is its own drawing with a start and an end.
 */
export function migrateAnnotations(saved: readonly unknown[]): Annotation[] {
  return saved.flatMap((item): Annotation[] => {
    if (!item || typeof item !== 'object') return []
    if ('shape' in item) return [cleanEffects(item as Annotation)]
    const legacy = item as Partial<LegacyAnnotation>
    if (!Array.isArray(legacy.shapes) || typeof legacy.time !== 'number' || !legacy.id || !legacy.sourcePath) return []
    const { id, sourcePath, time } = legacy
    const end = time + (legacy.showFor ?? DEFAULT_SHOW_FOR)
    return legacy.shapes.map((shape, index) => ({ id: index === 0 ? id : `${id}-${index}`, sourcePath, start: time, end, shape }))
  })
}

/**
 * Moves the drawings of a video onto exact frame start times. Drawings made before the frame
 * table loaded were pinned with the nominal rate; once the table arrives they would no longer match
 * any frame. Each keeps its length. Returns the same array when nothing moved.
 */
export function snapToFrames(
  annotations: readonly Annotation[],
  sourcePath: string,
  frameStart: (time: number) => number
): readonly Annotation[] {
  let changed = false
  const result = annotations.map((annotation) => {
    if (annotation.sourcePath !== sourcePath) return annotation
    const start = frameStart(annotation.start + SAME_FRAME_TOLERANCE / 2)
    if (Math.abs(start - annotation.start) < SAME_FRAME_TOLERANCE / 10) return annotation
    changed = true
    return retime(annotation, start, annotation.end + start - annotation.start, true)
  })
  return changed ? result : annotations
}
