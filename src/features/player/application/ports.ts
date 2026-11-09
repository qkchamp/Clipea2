/** Driven port: a file the <video> element can load for any video ffmpeg reads. */
export interface PlayableFiles {
  /**
   * The video itself when it plays as it is; otherwise the path of a converted copy, made the first
   * time and kept. `reencode` asks for the last resort (everything encoded again) when that did not play.
   */
  playableFile(path: string, reencode?: boolean): Promise<string>
}
