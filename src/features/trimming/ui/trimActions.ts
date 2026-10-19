import { recordingLabel } from '@features/library/domain/libraryClip'
import { useMontageStore } from '@features/montage/ui/montageStore'
import { frameEndTime, frameStartTime } from '@features/player/domain/frameClock'
import { usePlayerStore } from '@features/player/ui/playerStore'
import { getFrameClock } from '@features/player/ui/useFrameClock'
import { isValidRange } from '../domain/timeRange'
import { useTrimStore } from './trimStore'

/** Selection that belongs to the video on screen, if any. */
export function currentSelection() {
  const { sourcePath } = usePlayerStore.getState()
  const { range, rangeSource } = useTrimStore.getState()
  return sourcePath && range && rangeSource === sourcePath ? { sourcePath, range } : null
}

/** I: in point on the frame on screen. */
export function markInAtPlayhead(): void {
  const { sourcePath, currentTime, duration } = usePlayerStore.getState()
  if (!sourcePath || duration <= 0) return
  useTrimStore.getState().markIn(frameStartTime(getFrameClock(), currentTime), duration)
}

/** O: out point right after the frame on screen, so that frame is included. */
export function markOutAtPlayhead(): void {
  const { sourcePath, currentTime, duration } = usePlayerStore.getState()
  if (!sourcePath || duration <= 0) return
  const frameEnd = Math.min(duration, frameEndTime(getFrameClock(), currentTime))
  useTrimStore.getState().markOut(frameEnd, duration)
}

/** Enter: adds the selection to the montage, or saves the segment being edited. */
export function commitSelection(): void {
  const selection = currentSelection()
  if (!selection || !isValidRange(selection.range)) return
  const trim = useTrimStore.getState()
  const montage = useMontageStore.getState()
  const player = usePlayerStore.getState()
  if (trim.editingSegmentId) {
    montage.updateRange(trim.editingSegmentId, selection.range.start, selection.range.end)
    trim.stopEditing()
    player.showOsd('Corte actualizado')
    return
  }
  montage.add({
    sourcePath: selection.sourcePath,
    sourceLabel: recordingLabel(selection.sourcePath),
    start: selection.range.start,
    end: selection.range.end
  })
  player.showOsd(`Agregado al montaje (#${useMontageStore.getState().segments.length})`)
}

export function goToSelectionEdge(edge: 'start' | 'end'): void {
  const selection = currentSelection()
  if (!selection) return
  const controller = usePlayerStore.getState().controller
  controller?.pause()
  controller?.seek(edge === 'start' ? selection.range.start + 0.001 : Math.max(0, selection.range.end - 0.001))
}
