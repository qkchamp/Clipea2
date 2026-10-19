export interface RenderSegmentInput {
  sourcePath: string
  start: number
  end: number
}

export interface RenderAnnotationInput {
  id: string
  sourcePath: string
  time: number
  showFor: number
  freezeFor: number
}

/** Continuous piece of source video; `holdAfter` freezes its last frame for that many seconds. */
export interface RenderPart {
  from: number
  to: number
  holdAfter: number
}

export interface RenderSegment {
  sourcePath: string
  start: number
  end: number
  parts: RenderPart[]
  outputStart: number
  outputDuration: number
}

/** When a drawing is on screen, in seconds of the exported clip. */
export interface OverlayWindow {
  annotationId: string
  start: number
  end: number
}

export interface RenderTimeline {
  segments: RenderSegment[]
  overlays: OverlayWindow[]
  totalDuration: number
}

const EPSILON = 1e-6

/**
 * Turns the montage plus its drawings into what the encoder needs: the source pieces to
 * concatenate (split wherever a drawing freezes the image) and when each drawing shows up.
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
    const parts: RenderPart[] = []
    let cursor = segment.start
    let outputAtCursor = outputCursor
    const fromSource = annotations.filter((annotation) => annotation.sourcePath === segment.sourcePath)

    // Drawings made just before the cut that are still on screen when it starts.
    for (const annotation of fromSource) {
      const visibleUntil = annotation.time + Math.max(annotation.showFor, frameDuration)
      if (annotation.time < segment.start - EPSILON && visibleUntil > segment.start + EPSILON) {
        overlays.push({
          annotationId: annotation.id,
          start: outputCursor,
          end: outputCursor + Math.min(visibleUntil, segment.end) - segment.start
        })
      }
    }

    const inside = fromSource
      .filter((annotation) => annotation.time >= segment.start - EPSILON && annotation.time < segment.end - EPSILON)
      .sort((a, b) => a.time - b.time)

    for (const annotation of inside) {
      const shownAt = outputAtCursor + Math.max(0, annotation.time - cursor)
      if (annotation.freezeFor > 0) {
        const frameEnd = Math.min(Math.max(annotation.time, segment.start) + frameDuration, segment.end)
        if (frameEnd > cursor + EPSILON) {
          parts.push({ from: cursor, to: frameEnd, holdAfter: annotation.freezeFor })
          outputAtCursor += frameEnd - cursor + annotation.freezeFor
          cursor = frameEnd
        } else if (parts.length > 0) {
          parts[parts.length - 1].holdAfter += annotation.freezeFor
          outputAtCursor += annotation.freezeFor
        }
        overlays.push({
          annotationId: annotation.id,
          start: shownAt,
          end: shownAt + frameDuration + annotation.freezeFor + annotation.showFor
        })
      } else {
        overlays.push({
          annotationId: annotation.id,
          start: shownAt,
          end: shownAt + Math.max(annotation.showFor, frameDuration)
        })
      }
    }

    if (segment.end - cursor > EPSILON || parts.length === 0) {
      parts.push({ from: cursor, to: segment.end, holdAfter: 0 })
      outputAtCursor += segment.end - cursor
    }

    rendered.push({
      sourcePath: segment.sourcePath,
      start: segment.start,
      end: segment.end,
      parts,
      outputStart: outputCursor,
      outputDuration: outputAtCursor - outputCursor
    })
    outputCursor = outputAtCursor
  }

  const visible = overlays
    .map((window) => ({ ...window, start: Math.max(0, window.start), end: Math.min(outputCursor, window.end) }))
    .filter((window) => window.end - window.start > EPSILON)

  return { segments: rendered, overlays: visible, totalDuration: outputCursor }
}
