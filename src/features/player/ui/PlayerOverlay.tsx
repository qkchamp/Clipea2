import { memo, useMemo } from 'react'
import {
  isVisibleAt,
  keyframeAt,
  newDrawingTimes,
  shapeOnFrame,
  visibleAnnotations,
  type Shape
} from '@features/annotations/domain/annotation'
import { PLAIN_LOOK, hasEffects, lookAt } from '@features/annotations/domain/effects'
import { AnnotationLayer, type PlacedDrawing, type VideoRect } from '@features/annotations/ui/AnnotationLayer'
import { AnnotationToolbar } from '@features/annotations/ui/AnnotationToolbar'
import { useAnnotationStore } from '@features/annotations/ui/annotationStore'
import { redo, undo, useUndoStore } from '@features/undo/ui/undoStore'
import { frameDuration, frameStartTime } from '../domain/frameClock'
import { usePlayerStore } from './playerStore'
import { getFrameClock, useFrameClock } from './useFrameClock'

const Layer = memo(AnnotationLayer)
const drawings = useAnnotationStore.getState

/** A new drawing lasts two seconds from the frame on screen, or the last two of the video near its end (stretch its bar in the timeline). */
const addShape = (shape: Shape): void => {
  const path = usePlayerStore.getState().sourcePath
  if (!path) return
  const clock = getFrameClock()
  const frameStart = frameStartTime(clock, usePlayerStore.getState().currentTime)
  const videoEnd = clock.duration > 0 ? clock.duration : Infinity
  const { start, end } = newDrawingTimes(frameStart, frameDuration(clock), videoEnd, (time) => frameStartTime(clock, time))
  drawings().add(path, start, end, shape)
}

const currentFrameTime = (): number => frameStartTime(getFrameClock(), usePlayerStore.getState().currentTime)
const select = (id: string | null): void => drawings().select(id)
const move = (id: string, dx: number, dy: number): void => drawings().move(id, dx, dy, currentFrameTime())
const resize = (id: string, shape: Shape): void => drawings().reshape(id, shape, currentFrameTime())
const editText = (id: string, text: string): void => drawings().setText(id, text)

/**
 * Drawings over the video. It lives apart from the player and renders only when the set of visible
 * drawings changes, or on every frame while one of them has keyframes or effects.
 */
export function PlayerOverlay({ rect, sourcePath }: { rect: VideoRect; sourcePath: string }) {
  const annotations = useAnnotationStore((state) => state.annotations)
  const drawing = useAnnotationStore((state) => state.drawing)
  const tool = useAnnotationStore((state) => state.tool)
  const color = useAnnotationStore((state) => state.color)
  const width = useAnnotationStore((state) => state.width)
  const selectedId = useAnnotationStore((state) => state.selectedId)
  const clock = useFrameClock()

  // Not the time itself but what it shows: the frames go by without rendering this, unless a
  // drawing comes or goes, or one on screen moves or fades with them.
  const visibleKey = usePlayerStore((state) =>
    visibleAnnotations(annotations, sourcePath, state.currentTime, frameDuration(clock))
      .map((annotation) => annotation.id)
      .join('|')
  )
  const visible = useMemo(() => {
    const ids = new Set(visibleKey.split('|'))
    return annotations.filter((annotation) => ids.has(annotation.id))
  }, [annotations, visibleKey])
  // Only a drawing with keyframes or effects looks different from frame to frame.
  const changes = visible.some((annotation) => annotation.keyframes?.length || hasEffects(annotation))
  const placedAt = usePlayerStore((state) => (changes ? frameStartTime(clock, state.currentTime) : null))
  const items = useMemo<PlacedDrawing[]>(
    () =>
      visible.map((annotation) => ({
        id: annotation.id,
        shape: placedAt !== null && annotation.keyframes?.length ? shapeOnFrame(annotation, placedAt) : annotation.shape,
        look: placedAt !== null ? lookAt(annotation, placedAt) : PLAIN_LOOK
      })),
    [visible, placedAt]
  )

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
      onResize={resize}
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
  const sourcePath = usePlayerStore((state) => state.sourcePath)
  // A drawing picked in another video stays picked, but this toolbar only deletes the ones of this one.
  const deletable = selected !== undefined && selected.sourcePath === sourcePath
  return (
    <AnnotationToolbar
      canUndo={canUndo}
      canRedo={canRedo}
      keyframe={keyframe}
      canDelete={deletable}
      onUndo={undo}
      onRedo={redo}
      onKeyframe={() => selected && drawings().toggleKeyframe(selected.id, frameTime)}
      onDelete={() => deletable && drawings().remove(selected.id)}
      onClose={() => drawings().setDrawing(false)}
    />
  )
}
