import { memo, useMemo } from 'react'
import { findAnnotationAt, visibleAnnotations, type Shape } from '@features/annotations/domain/annotation'
import { AnnotationLayer, type VideoRect } from '@features/annotations/ui/AnnotationLayer'
import { AnnotationToolbar } from '@features/annotations/ui/AnnotationToolbar'
import { useAnnotationStore } from '@features/annotations/ui/annotationStore'
import { quietly } from '@features/undo/ui/undoStore'
import { frameDuration, frameStartTime } from '../domain/frameClock'
import { usePlayerStore } from './playerStore'
import { getFrameClock, useFrameClock } from './useFrameClock'

const Layer = memo(AnnotationLayer)

const addShape = (shape: Shape): void => {
  const path = usePlayerStore.getState().sourcePath
  if (!path) return
  const time = frameStartTime(getFrameClock(), usePlayerStore.getState().currentTime)
  useAnnotationStore.getState().addShape(path, time, shape)
}

/**
 * Drawings over the video. It follows the playhead on every frame, so it lives apart from the
 * player: only this small piece re-renders while the video plays, and the canvas repaints only
 * when the set of visible drawings changes.
 */
export function PlayerOverlay({ rect, sourcePath }: { rect: VideoRect; sourcePath: string }) {
  const currentTime = usePlayerStore((state) => state.currentTime)
  const annotations = useAnnotationStore((state) => state.annotations)
  const drawing = useAnnotationStore((state) => state.drawing)
  const tool = useAnnotationStore((state) => state.tool)
  const color = useAnnotationStore((state) => state.color)
  const width = useAnnotationStore((state) => state.width)
  const clock = useFrameClock()

  const visibleKey = visibleAnnotations(annotations, sourcePath, currentTime, frameDuration(clock))
    .map((annotation) => annotation.id)
    .join('|')
  const shapes = useMemo<Shape[]>(() => {
    const ids = new Set(visibleKey.split('|'))
    return annotations.filter((annotation) => ids.has(annotation.id)).flatMap((annotation) => annotation.shapes)
  }, [annotations, visibleKey])

  return <Layer rect={rect} shapes={shapes} drawing={drawing} tool={tool} color={color} width={width} onShape={addShape} />
}

/**
 * Drawing tools, shown above the video (never over it, so the whole frame stays drawable).
 * Mounted only while drawing; the timing controls edit the drawing on the frame on screen.
 */
export function DrawingToolbar({ sourcePath }: { sourcePath: string }) {
  const currentTime = usePlayerStore((state) => state.currentTime)
  const annotations = useAnnotationStore((state) => state.annotations)
  const clock = useFrameClock()
  const frameTime = frameStartTime(clock, currentTime)
  const active = findAnnotationAt(annotations, sourcePath, frameTime)
  return (
    <AnnotationToolbar
      active={active}
      onUndo={() => quietly(() => useAnnotationStore.getState().undo(sourcePath, frameTime))}
      onDelete={(id) => useAnnotationStore.getState().remove(id)}
      onClose={() => useAnnotationStore.getState().setDrawing(false)}
    />
  )
}
