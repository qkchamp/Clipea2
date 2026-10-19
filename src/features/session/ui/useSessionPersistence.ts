import { useEffect } from 'react'
import { api } from '@shared/ui/api'
import { useAnnotationStore } from '@features/annotations/ui/annotationStore'
import { useMontageStore } from '@features/montage/ui/montageStore'
import { usePlayerStore } from '@features/player/ui/playerStore'
import { resetUndo } from '@features/undo/ui/undoStore'

const SAVE_DELAY_MS = 600

const snapshot = () => ({
  montage: useMontageStore.getState().segments,
  annotations: useAnnotationStore.getState().annotations,
  lastSourcePath: usePlayerStore.getState().sourcePath
})

/**
 * Restores the montage and drawings on start and saves them (debounced) whenever they change.
 * Closing the window saves right away, so the last edit is never lost.
 */
export function useSessionPersistence(): void {
  useEffect(() => {
    let restored = false
    let timer: number | undefined
    let dirty = false

    const saveNow = (): void => {
      window.clearTimeout(timer)
      timer = undefined
      if (!restored || !dirty) return
      dirty = false
      void api.session.save(snapshot()).catch(() => {
        dirty = true
      })
    }
    const save = (): void => {
      if (!restored) return
      dirty = true
      window.clearTimeout(timer)
      timer = window.setTimeout(saveNow, SAVE_DELAY_MS)
    }

    void api.session
      .load()
      .then((saved) => {
        if (!saved) return
        useMontageStore.getState().replaceAll(saved.montage)
        useAnnotationStore.getState().replaceAll(saved.annotations)
        if (saved.lastSourcePath && !usePlayerStore.getState().sourcePath) usePlayerStore.getState().open(saved.lastSourcePath)
      })
      .catch(() => undefined)
      .finally(() => {
        // The restored session is the starting point: nothing before it to undo.
        resetUndo()
        restored = true
      })

    const unsubscribers = [
      useMontageStore.subscribe((state, previous) => state.segments !== previous.segments && save()),
      useAnnotationStore.subscribe((state, previous) => state.annotations !== previous.annotations && save()),
      usePlayerStore.subscribe((state, previous) => state.sourcePath !== previous.sourcePath && save())
    ]
    window.addEventListener('beforeunload', saveNow)
    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe())
      window.removeEventListener('beforeunload', saveNow)
      saveNow()
    }
  }, [])
}
