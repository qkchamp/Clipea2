import type { MediaInfo } from '@features/media/domain/mediaInfo'

/**
 * What the <video> element plays by itself, measured on the Chromium this app ships with. Everything
 * else is unreliable in its own way: AVI, FLV, MPEG-TS, MPG and WMV fail to open; MPEG-4 (Xvid, DivX),
 * MJPEG, ProRes, DNxHR or Theora load with sound and no picture; AC-3, DTS and ALAC play silent.
 */
const DIRECT_CONTAINERS = ['.mp4', '.m4v', '.mov', '.mkv', '.webm', '.3gp', '.3g2', '.f4v']
const DIRECT_VIDEO = new Set(['h264', 'hevc', 'av1', 'vp8', 'vp9'])
const DIRECT_AUDIO = new Set(['aac', 'mp3', 'opus', 'vorbis', 'flac'])

/** Streams an MP4 carries as they are: the playable copy takes them without encoding again. */
const COPIED_VIDEO = new Set(['h264', 'hevc', 'av1', 'vp9'])
const COPIED_AUDIO = new Set(['aac', 'mp3', 'opus'])
/**
 * AVI stores the frames in decoding order with no presentation times: copied as they are, the ones
 * after a B-frame end up out of order on screen. Its picture is always encoded again.
 */
const NO_FRAME_TIMES = ['.avi', '.divx']

/** How ffmpeg makes the copy the player loads: `copy` moves the stream untouched (as fast as the disk). */
export interface ConversionPlan {
  video: 'copy' | 'encode'
  /** `none`: the file has no sound. */
  audio: 'copy' | 'encode' | 'none'
}

/** How far ffmpeg is into making the copy of a video. */
export interface ConversionProgress {
  /** The video being converted (not its copy). */
  path: string
  /** 0..1 */
  fraction: number
}

/** `direct`: the file plays as it is. */
export type PlaybackPlan = 'direct' | ConversionPlan

const playsAudio = (codec: string): boolean => DIRECT_AUDIO.has(codec) || codec.startsWith('pcm_')

/** The player can try the file itself right away, before knowing what is inside. */
export function opensDirectly(path: string): boolean {
  const lower = path.toLowerCase()
  return DIRECT_CONTAINERS.some((extension) => lower.endsWith(extension))
}

export function playbackPlan(info: MediaInfo): PlaybackPlan {
  const video = info.video?.codec ?? ''
  const audio = info.audio.map((stream) => stream.codec)
  // A file with sound only has no picture to convert: it plays as it is.
  const picture = info.video === null || DIRECT_VIDEO.has(video)
  if (opensDirectly(info.path) && picture && audio.every(playsAudio)) return 'direct'
  const lower = info.path.toLowerCase()
  const timed = !NO_FRAME_TIMES.some((extension) => lower.endsWith(extension))
  return {
    video: timed && COPIED_VIDEO.has(video) ? 'copy' : 'encode',
    audio: audio.length === 0 ? 'none' : audio.every((codec) => COPIED_AUDIO.has(codec)) ? 'copy' : 'encode'
  }
}

/**
 * Last resort when the first choice did not play (HEVC on a machine without a decoder for it, a
 * stream that would not go into an MP4): everything is encoded again.
 */
export function fullConversion(info: MediaInfo): ConversionPlan {
  return { video: 'encode', audio: info.audio.length === 0 ? 'none' : 'encode' }
}

/** Part of the name of the cached copy: a different plan is a different file. */
export function planKey(plan: ConversionPlan): string {
  return `${plan.video}-${plan.audio}`
}
