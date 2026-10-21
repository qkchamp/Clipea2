import type { Annotation } from '@features/annotations/domain/annotation'
import type { Segment } from '@features/montage/domain/montage'

/** What undo can bring back: the montage and the drawings. */
export interface EditSnapshot {
  segments: readonly Segment[]
  annotations: readonly Annotation[]
}

export interface EditHistory {
  past: EditSnapshot[]
  future: EditSnapshot[]
}

export const MAX_UNDO = 100
export const EMPTY_HISTORY: EditHistory = { past: [], future: [] }

/** A change happened: `before` becomes undoable and redo is no longer possible. */
export function record(history: EditHistory, before: EditSnapshot): EditHistory {
  return { past: [...history.past, before].slice(-MAX_UNDO), future: [] }
}

export function undo(history: EditHistory, current: EditSnapshot): { history: EditHistory; snapshot: EditSnapshot } | null {
  const snapshot = history.past[history.past.length - 1]
  if (!snapshot) return null
  return { snapshot, history: { past: history.past.slice(0, -1), future: [current, ...history.future] } }
}

export function redo(history: EditHistory, current: EditSnapshot): { history: EditHistory; snapshot: EditSnapshot } | null {
  const [snapshot, ...future] = history.future
  if (!snapshot) return null
  return { snapshot, history: { past: [...history.past, current].slice(-MAX_UNDO), future } }
}

export type ChangeKind =
  | 'segment-added'
  | 'segment-removed'
  | 'montage-cleared'
  | 'montage-replaced'
  | 'montage-reordered'
  | 'segment-edited'
  | 'drawing-added'
  | 'drawing-removed'
  | 'drawing-edited'
  | 'none'

const sameIds = (a: readonly { id: string }[], b: readonly { id: string }[]): boolean =>
  a.length === b.length && a.every((item) => b.some((other) => other.id === item.id))

/** Names the change between two snapshots, for messages like "Deshecho: corte quitado". */
export function describeChange(before: EditSnapshot, after: EditSnapshot): ChangeKind {
  if (before.segments !== after.segments) {
    const removed = before.segments.filter((segment) => !after.segments.some((other) => other.id === segment.id))
    const added = after.segments.filter((segment) => !before.segments.some((other) => other.id === segment.id))
    if (after.segments.length === 0 && before.segments.length > 1) return 'montage-cleared'
    if (removed.length > 0 && added.length > 0) return 'montage-replaced'
    if (removed.length > 0) return 'segment-removed'
    if (added.length > 0) return 'segment-added'
    if (sameIds(before.segments, after.segments) && before.segments.some((segment, index) => after.segments[index]?.id !== segment.id)) {
      return 'montage-reordered'
    }
    return 'segment-edited'
  }
  if (before.annotations !== after.annotations) {
    if (after.annotations.length < before.annotations.length) return 'drawing-removed'
    if (after.annotations.length > before.annotations.length) return 'drawing-added'
    return 'drawing-edited'
  }
  return 'none'
}

export const CHANGE_LABELS: Record<ChangeKind, string> = {
  'segment-added': 'corte agregado',
  'segment-removed': 'corte quitado',
  'montage-cleared': 'montaje vaciado',
  'montage-replaced': 'montaje reemplazado',
  'montage-reordered': 'orden del montaje',
  'segment-edited': 'corte editado',
  'drawing-added': 'dibujo agregado',
  'drawing-removed': 'dibujo borrado',
  'drawing-edited': 'dibujo cambiado',
  none: 'cambio'
}

/** Changes that lose work: they get a toast with "Deshacer" right away. */
export function isDestructive(kind: ChangeKind): boolean {
  return kind === 'segment-removed' || kind === 'montage-cleared' || kind === 'montage-replaced' || kind === 'drawing-removed'
}
