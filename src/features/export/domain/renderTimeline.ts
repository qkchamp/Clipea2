export interface RenderSegmentInput {
  sourcePath: string
  start: number
  end: number
}

/** Offset of an animated drawing at a moment of the source video, in fractions of the frame. */
export interface MotionKey {
  time: number
  dx: number
  dy: number
}

export interface RenderAnnotationInput {
  id: string
  sourcePath: string
  start: number
  end: number
  /** Animated drawings glide between these (two or more, sorted by time). */
  motion?: MotionKey[]
}

export interface RenderSegment {
  sourcePath: string
  start: number
  end: number
  outputStart: number
  outputDuration: number
}

/** When a drawing is on screen, in seconds of the exported clip. */
export interface OverlayWindow {
  annotationId: string
  start: number
  end: number
  /** Moment of the source video shown at `start` (animated drawings follow the source time). */
  sourceStart: number
}

export interface RenderTimeline {
  segments: RenderSegment[]
  overlays: OverlayWindow[]
  totalDuration: number
}

const EPSILON = 1e-6

/**
 * Turns the montage plus its drawings into what the encoder needs: the source pieces to
 * concatenate and when each drawing shows up in the exported clip.
 */
export function compileRenderTimeline(
  segments: readonly RenderSegmentInput[],
  annotations: readonly RenderAnnotationInput[],
  frameDuration: number
): RenderTimeline {
  const rendered: RenderSegment[] = []
  const overlays: OverlayWindow[] = []
  let outputCursor = 0

  for (const segment of segments) {
    for (const annotation of annotations) {
      if (annotation.sourcePath !== segment.sourcePath) continue
      // Every drawing lasts at least one frame, like in the player.
      const from = Math.max(annotation.start, segment.start)
      const until = Math.min(Math.max(annotation.end, annotation.start + frameDuration), segment.end)
      if (until - from > EPSILON) {
        overlays.push({
          annotationId: annotation.id,
          start: outputCursor + from - segment.start,
          end: outputCursor + until - segment.start,
          sourceStart: from
        })
      }
    }

    const duration = segment.end - segment.start
    rendered.push({ sourcePath: segment.sourcePath, start: segment.start, end: segment.end, outputStart: outputCursor, outputDuration: duration })
    outputCursor += duration
  }

  return { segments: rendered, overlays, totalDuration: outputCursor }
}
