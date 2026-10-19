export interface VideoStreamInfo {
  codec: string
  width: number
  height: number
  fps: number
  bitrateKbps: number | null
  startTime: number
}

export interface AudioStreamInfo {
  index: number
  codec: string
  channels: number
}

export interface MediaInfo {
  path: string
  durationSec: number
  sizeBytes: number
  video: VideoStreamInfo | null
  audio: AudioStreamInfo[]
}

/** Subset of `ffprobe -of json -show_format -show_streams`. */
export interface FfprobeOutput {
  streams?: Array<{
    index?: number
    codec_type?: string
    codec_name?: string
    width?: number
    height?: number
    r_frame_rate?: string
    avg_frame_rate?: string
    bit_rate?: string
    start_time?: string
    channels?: number
    disposition?: { attached_pic?: number }
  }>
  format?: { duration?: string; size?: string; bit_rate?: string }
}

export function parseFrameRate(value: string | undefined): number {
  if (!value) return 0
  const [numerator, denominator = '1'] = value.split('/')
  const rate = Number(numerator) / Number(denominator)
  return Number.isFinite(rate) && rate > 0 ? rate : 0
}

/** ShadowPlay files are VFR: r_frame_rate holds the nominal rate (30/1), avg is noisy. */
export function pickFps(nominal: number, average: number): number {
  const candidate = nominal > 0 && nominal <= 240 ? nominal : average > 0 && average <= 240 ? average : 30
  return Math.round(candidate * 1000) / 1000
}

const toNumber = (value: string | undefined): number | null => {
  const parsed = Number(value)
  return value !== undefined && Number.isFinite(parsed) ? parsed : null
}

export function mediaInfoFromFfprobe(path: string, output: FfprobeOutput): MediaInfo {
  const streams = output.streams ?? []
  const videoStream = streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic)
  const audio = streams
    .filter((s) => s.codec_type === 'audio')
    .map((s, position) => ({ index: position, codec: s.codec_name ?? 'unknown', channels: s.channels ?? 2 }))

  const bitrate = toNumber(videoStream?.bit_rate)
  const video: VideoStreamInfo | null = videoStream
    ? {
        codec: videoStream.codec_name ?? 'unknown',
        width: videoStream.width ?? 0,
        height: videoStream.height ?? 0,
        fps: pickFps(parseFrameRate(videoStream.r_frame_rate), parseFrameRate(videoStream.avg_frame_rate)),
        bitrateKbps: bitrate === null ? null : Math.round(bitrate / 1000),
        startTime: toNumber(videoStream.start_time) ?? 0
      }
    : null

  return {
    path,
    durationSec: toNumber(output.format?.duration) ?? 0,
    sizeBytes: toNumber(output.format?.size) ?? 0,
    video,
    audio
  }
}
