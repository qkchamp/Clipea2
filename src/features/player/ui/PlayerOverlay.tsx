import { memo, useMemo } from 'react'
import {
  DEFAULT_SHOW_FOR,
  isVisibleAt,
  keyframeAt,
  shapeOnFrame,
  visibleAnnotations,
  type Annotation,
  type Shape
} from '@features/annotations/domain/annotation'
import { AnnotationLayer, type VideoRect } from '@features/annotations/ui/AnnotationLayer'
import { AnnotationToolbar } from '@features/annotations/ui/AnnotationToolbar'
import { useAnnotationStore } from '@features/annotations/ui/annotationStore'
import { redo, undo, useUndoStore } from '@features/undo/ui/undoStore'
import { frameDuration, frameStartTime } from '../domain/frameClock'
import { usePlayerStore } from './playerStore'
import { getFrameClock, useFrameClock } from './useFrameClock'

const Layer = memo(AnnotationLayer)
const drawings = useAnnotationStore.getState

/** A new drawing starts on the frame on screen and lasts DEFAULT_SHOW_FOR (stretch its bar in the timeline). */
const addShape = (shape: Shape): void => {
  const path = usePlayerStore.getState().sourcePath
  if (!path) return
  const clock = getFrameClock()
  const start = frameStartTime(clock, usePlayerStore.getState().currentTime)
  const videoEnd = clock.duration > 0 ? clock.duration : Infinity
  const end = Math.max(Math.min(start + DEFAULT_SHOW_FOR, videoEnd), start + frameDuration(clock))
  drawings().add(path, start, end, shape)
}

const currentFrameTime = (): number => frameStartTime(getFrameClock(), usePlayerStore.getState().currentTime)
const select = (id: string | null): void => drawings().select(id)
const move = (id: string, dx: number, dy: number): void => drawings().move(id, dx, dy, currentFrameTime())
const editText = (id: string, text: string): void => drawings().setText(id, text)

/**
 * Drawings over the video. It follows the playhead on every frame, so it lives apart from the
 * player: only this small piece re-renders while the video plays, and the canvas repaints only
 * when the set of visible drawings changes, or on every frame while one of them is animated.
 */
export function PlayerOverlay({ rect, sourcePath }: { rect: VideoRect; sourcePath: string }) {
  const currentTime = usePlayerStore((state) => state.currentTime)
  const annotations = useAnnotationStore((state) => state.annotations)
  const drawing = useAnnotationStore((state) => state.drawing)
  const tool = useAnnotationStore((state) => state.tool)
  const color = useAnnotationStore((state) => state.color)
  const width = useAnnotationStore((state) => state.width)
  const selectedId = useAnnotationStore((state) => state.selectedId)
  const clock = useFrameClock()

  const visible = visibleAnnotations(annotations, sourcePath, currentTime, frameDuration(clock))
  const visibleKey = visible.map((annotation) => annotation.id).join('|')
  // Only a drawing with keyframes changes place from frame to frame.
  const placedAt = visible.some((annotation) => annotation.keyframes?.length) ? frameStartTime(clock, currentTime) : null
  const items = useMemo<Annotation[]>(() => {
    const ids = new Set(visibleKey.split('|'))
    return annotations
      .filter((annotation) => ids.has(annotation.id))
      .map((annotation) => (placedAt !== null && annotation.keyframes?.length ? { ...annotation, shape: shapeOnFrame(annotation, placedAt) } : annotation))
  }, [annotations, visibleKey, placedAt])

  return (
    <Layer
      rect={rect}
      items={items}
      drawing={drawing}
      tool={tool}
      color={color}
      width={width}
      selectedId={selectedId}
      onShape={addShape}
      onSelect={select}
      onMove={move}
      onEditText={editText}
    />
  )
}

/**
 * Drawing tools, shown above the video (never over it, so the whole frame stays drawable). Mounted
 * only while drawing; the keyframe button works on the selected drawing at the frame on screen.
 */
export function DrawingToolbar() {
  const canUndo = useUndoStore((state) => state.history.past.length > 0)
  const canRedo = useUndoStore((state) => state.history.future.length > 0)
  const currentTime = usePlayerStore((state) => state.currentTime)
  const selected = useAnnotationStore((state) => state.annotations.find((annotation) => annotation.id === state.selectedId))
  const clock = useFrameClock()
  const frameTime = frameStartTime(clock, currentTime)
  const onScreen = selected !== undefined && isVisibleAt(selected, frameTime, frameDuration(clock))
  const keyframe = !onScreen ? 'none' : keyframeAt(selected, frameTime) ? 'remove' : 'add'
  return (
    <AnnotationToolbar
      canUndo={canUndo}
      canRedo={canRedo}
      keyframe={keyframe}
      onUndo={undo}
      onRedo={redo}
      onKeyframe={() => selected && drawings().toggleKeyframe(selected.id, frameTime)}
      onClose={() => drawings().setDrawing(false)}
    />
  )
}
