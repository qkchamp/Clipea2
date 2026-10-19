import type { MediaInfo } from '../domain/mediaInfo'

/** Driven port: reads technical facts about a video file. */
export interface MediaProber {
  probe(path: string): Promise<MediaInfo>
  /** Presentation time of every video frame, in source seconds (unsorted, not rebased). */
  frameTimes(path: string): Promise<number[]>
}

/** Driven port: small JPG previews of a video. Returns file paths. */
export interface Thumbnailer {
  thumbnail(videoPath: string, atSec?: number): Promise<string>
  filmstrip(videoPath: string, count: number): Promise<string[]>
}
