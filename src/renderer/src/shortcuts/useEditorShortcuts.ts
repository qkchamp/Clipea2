import { useEffect } from 'react'
import { api } from '@shared/ui/api'
import { useUiStore } from '@shared/ui/uiStore'
import { useAnnotationStore } from '@features/annotations/ui/annotationStore'
import { startExport } from '@features/export/ui/startExport'
import { openRecording } from '@features/library/ui/LibraryPanel'
import { usePlayerStore } from '@features/player/ui/playerStore'
import { commitSelection, goToSelectionEdge, markInAtPlayhead, markOutAtPlayhead } from '@features/trimming/ui/trimActions'
import { redo, undo } from '@features/undo/ui/undoStore'

type Binding = (event: KeyboardEvent) => void

const player = usePlayerStore.getState
const drawings = useAnnotationStore.getState
const togglePlay = (): void => player().controller?.togglePlay()

/** Ctrl+key. Player keys: Ctrl+↑/↓ speed in 0.25x steps, Ctrl+←/→ one frame. */
const CTRL_BINDINGS: Record<string, Binding> = {
  arrowup: () => player().stepRate(1),
  arrowdown: () => player().stepRate(-1),
  arrowright: () => player().controller?.stepFrame(1),
  arrowleft: () => player().controller?.stepFrame(-1),
  r: () => player().resetRate(),
  e: () => void startExport(),
  o: () => void api.system.openVideos().then(([first]) => first && openRecording(first)),
  // Montage and drawings share one history: a stroke, a removed cut or a cleared montage.
  z: (event) => (event.shiftKey ? redo() : undo()),
  y: () => redo()
}

const KEY_BINDINGS: Record<string, Binding> = {
  ' ': togglePlay,
  k: togglePlay,
  arrowright: (event) => player().controller?.seekBy(event.shiftKey ? 1 : 5),
  arrowleft: (event) => player().controller?.seekBy(event.shiftKey ? -1 : -5),
  i: markInAtPlayhead,
  o: markOutAtPlayhead,
  enter: commitSelection,
  home: () => goToSelectionEdge('start'),
  end: () => goToSelectionEdge('end'),
  m: () => player().toggleMute(),
  d: () => player().sourcePath && drawings().setDrawing(!drawings().drawing),
  '?': () => useUiStore.getState().openDialog('help'),
  escape: () => {
    if (drawings().drawing) drawings().setDrawing(false)
    else player().stopPreview()
  },
  // The drawing picked with the cursor or on its bar in the timeline.
  delete: () => {
    const { selectedId, annotations } = drawings()
    const selected = annotations.find((annotation) => annotation.id === selectedId)
    if (selected && selected.sourcePath === player().sourcePath) drawings().remove(selected.id)
  }
}

const isTyping = (target: EventTarget | null): boolean => {
  if (target instanceof HTMLInputElement) return target.type !== 'range'
  return target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable)
}

export function useEditorShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      // A panel can also ask something in a dialog of its own (ConfirmDialog), outside the store.
      const modalOpen = useUiStore.getState().dialog !== null || document.querySelector('[aria-modal="true"]') !== null
      if (event.defaultPrevented || event.altKey || modalOpen || isTyping(event.target)) return
      const key = event.key.toLowerCase()
      // A focused button already reacts to Enter, and to Space on key up.
      if (event.target instanceof HTMLButtonElement && (key === 'enter' || key === ' ')) {
        if (key === 'enter') return
        event.target.blur()
      }
      const binding = (event.ctrlKey || event.metaKey ? CTRL_BINDINGS : KEY_BINDINGS)[key]
      if (!binding) return
      event.preventDefault()
      binding(event)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
