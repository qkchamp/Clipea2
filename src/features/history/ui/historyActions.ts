import { createId } from '@shared/domain/id'
import { useUiStore } from '@shared/ui/uiStore'
import { useAnnotationStore } from '@features/annotations/ui/annotationStore'
import { useMontageStore } from '@features/montage/ui/montageStore'
import { usePlayerStore } from '@features/player/ui/playerStore'
import { useTrimStore } from '@features/trimming/ui/trimStore'
import type { HistoryEntry } from '../domain/exportRecord'

/** Puts the cuts and drawings of a past export back in the editor to tweak them. */
export function editInMontage(entry: HistoryEntry): void {
  useMontageStore.getState().replaceAll(entry.segments.map((segment) => ({ ...segment, id: createId() })))

  const drawings = useAnnotationStore.getState()
  const known = new Set(drawings.annotations.map((annotation) => annotation.id))
  drawings.replaceAll([...drawings.annotations, ...entry.annotations.filter((annotation) => !known.has(annotation.id))])

  useTrimStore.getState().stopEditing()
  const player = usePlayerStore.getState()
  player.stopPreview()
  const [first] = entry.segments
  if (first) player.open(first.sourcePath, { time: first.start + 0.001, play: false })
  useUiStore.getState().setSidebarTab('montage')
}
