import { getT } from '@shared/i18n'
import { create } from 'zustand'
import { useUiStore } from '@shared/ui/uiStore'
import { useAnnotationStore } from '@features/annotations/ui/annotationStore'
import { useMontageStore } from '@features/montage/ui/montageStore'
import { usePlayerStore } from '@features/player/ui/playerStore'
import { useTrimStore } from '@features/trimming/ui/trimStore'
import {
  changeLabel,
  describeChange,
  EMPTY_HISTORY,
  isDestructive,
  record,
  redo as redoStep,
  undo as undoStep,
  type EditHistory,
  type EditSnapshot
} from '../domain/editHistory'

interface UndoState {
  history: EditHistory
}

/** Undo/redo for the montage and the drawings (Ctrl+Z / Ctrl+Y), fed by watching both stores. */
export const useUndoStore = create<UndoState>(() => ({ history: EMPTY_HISTORY }))

let applying = false
let lastSnapshot: EditSnapshot = current()

function current(): EditSnapshot {
  return { segments: useMontageStore.getState().segments, annotations: useAnnotationStore.getState().annotations }
}

function onChange(): void {
  const next = current()
  const before = lastSnapshot
  lastSnapshot = next
  if (applying) return
  const kind = describeChange(before, next)
  if (kind === 'none') return
  useUndoStore.setState((state) => ({ history: record(state.history, before) }))
  if (isDestructive(kind)) {
    const label = changeLabel(kind)
    useUiStore.getState().showToast({
      text: label.charAt(0).toUpperCase() + label.slice(1),
      actions: [{ label: getT().undo.undo, run: undo }]
    })
  }
}

useMontageStore.subscribe((state, previous) => state.segments !== previous.segments && onChange())
useAnnotationStore.subscribe((state, previous) => state.annotations !== previous.annotations && onChange())

function apply(snapshot: EditSnapshot): void {
  applying = true
  try {
    useMontageStore.getState().replaceAll([...snapshot.segments])
    useAnnotationStore.getState().replaceAll([...snapshot.annotations])
  } finally {
    applying = false
  }
  const editing = useTrimStore.getState().editingSegmentId
  if (editing && !snapshot.segments.some((segment) => segment.id === editing)) useTrimStore.getState().stopEditing()
}

/** Runs a change that is not the user's own edit (e.g. snapping drawings to exact frames): no undo step. */
export function untracked(change: () => void): void {
  const wasApplying = applying
  applying = true
  try {
    change()
  } finally {
    applying = wasApplying
  }
}

/**
 * Starts a change made of many small ones (dragging a drawing's bar frame by frame): they update the
 * stores live, and the returned function turns them into a single undo step.
 */
export function beginGesture(): () => void {
  const before = current()
  const wasApplying = applying
  applying = true
  return () => {
    applying = wasApplying
    lastSnapshot = before
    onChange()
  }
}

/** Forgets every step (used after restoring the session: that is the starting point). */
export function resetUndo(): void {
  lastSnapshot = current()
  useUndoStore.setState({ history: EMPTY_HISTORY })
}

export function undo(): void {
  const now = current()
  const step = undoStep(useUndoStore.getState().history, now)
  if (!step) return usePlayerStore.getState().showOsd(getT().undo.nothingToUndo)
  apply(step.snapshot)
  useUndoStore.setState({ history: step.history })
  usePlayerStore.getState().showOsd(getT().undo.undone(changeLabel(describeChange(step.snapshot, now))))
}

export function redo(): void {
  const now = current()
  const step = redoStep(useUndoStore.getState().history, now)
  if (!step) return usePlayerStore.getState().showOsd(getT().undo.nothingToRedo)
  apply(step.snapshot)
  useUndoStore.setState({ history: step.history })
  usePlayerStore.getState().showOsd(getT().undo.redone(changeLabel(describeChange(now, step.snapshot))))
}
