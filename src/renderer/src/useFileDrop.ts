import { useEffect } from 'react'
import { api } from '@shared/ui/api'
import { isVideoFile } from '@features/library/domain/libraryClip'

/** Videos dragged from Explorer onto the window. */
export function useFileDrop(onVideos: (paths: string[]) => void): void {
  useEffect(() => {
    const carriesFiles = (event: DragEvent): boolean => Boolean(event.dataTransfer?.types.includes('Files'))
    const onDragOver = (event: DragEvent): void => {
      if (!carriesFiles(event)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    }
    const onDrop = (event: DragEvent): void => {
      if (!carriesFiles(event)) return
      event.preventDefault()
      const paths = Array.from(event.dataTransfer?.files ?? [])
        .map((file) => api.system.pathForFile(file))
        .filter((path) => path && isVideoFile(path))
      if (paths.length > 0) onVideos(paths)
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [onVideos])
}
