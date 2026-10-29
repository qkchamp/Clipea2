import { usePlayerStore } from '@features/player/ui/playerStore'
import { Timeline, TimelinePlayhead } from './Timeline'
import { useFilmstrip } from './useFilmstrip'

/** Without an open clip the preview shows a minute with no frames. */
const FALLBACK_DURATION = 60

const noop = (): void => undefined

/**
 * The real timeline, frozen: a selection in the middle with the playhead inside it, over the open
 * clip's frames. Ajustes shows it to compare the in/out designs before picking one.
 */
export function TimelinePreview({ classic }: { classic: boolean }) {
  const sourcePath = usePlayerStore((state) => state.sourcePath)
  const clipDuration = usePlayerStore((state) => state.duration)
  // Same path and length as the trim panel's, so the thumbnails come from its cache.
  const frames = useFilmstrip(sourcePath, clipDuration)
  const duration = sourcePath && clipDuration > 0 ? clipDuration : FALLBACK_DURATION
  // Between the in line and the length label centered on top, so it covers neither.
  const playhead = duration * 0.32

  return (
    <Timeline
      duration={duration}
      range={{ start: duration * 0.2, end: duration * 0.8 }}
      frames={frames}
      bands={[]}
      drawings={[]}
      showDrawings={false}
      selectedDrawingId={null}
      classic={classic}
      onSeek={noop}
      onStepFrame={noop}
      onRangeChange={noop}
      onDrawingSelect={noop}
      onDrawingChange={noop}
      onDrawingDragEnd={noop}
      onDrawingEdit={noop}
      onDrawingDelete={noop}
      renderPlayhead={(toPercent) => <TimelinePlayhead time={playhead} duration={duration} toPercent={toPercent} />}
    />
  )
}
