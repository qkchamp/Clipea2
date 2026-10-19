export type VideoCodec = 'hevc' | 'h264' | 'av1'
export type QualityLevel = 'max' | 'high' | 'light'
export type QualityGrade = 'excelente' | 'buena' | 'aceptable' | 'baja'

export const CODEC_LABEL: Record<VideoCodec, string> = { hevc: 'H.265', h264: 'H.264', av1: 'AV1' }

/** "1280×720 · 30 fps · H.265 (GPU) · 1,5 Mbps máx."; `gpu` null leaves the device out (unknown). */
export function describeEncoding(
  video: { width: number; height: number; fps: number; codec: VideoCodec; kbps: number },
  gpu: boolean | null
): string {
  const device = gpu === null ? '' : gpu ? ' (GPU)' : ' (CPU)'
  const mbps = (video.kbps / 1000).toFixed(1).replace('.', ',')
  return `${video.width}×${video.height} · ${Math.round(video.fps)} fps · ${CODEC_LABEL[video.codec]}${device} · ${mbps} Mbps máx.`
}

export interface EncodingPreferences {
  codec: VideoCodec
  quality: QualityLevel
  /** null keeps the source resolution. Never upscales. */
  maxHeight: number | null
  /** null keeps the source frame rate. */
  maxFps: number | null
  audioKbps: number
  /** null = no size limit (quality only). */
  sizeLimitBytes: number | null
}

export interface SourceVideoSummary {
  width: number
  height: number
  fps: number
  codec: string
  videoKbps: number | null
}

export interface EncodingPlan {
  width: number
  height: number
  fps: number
  codec: VideoCodec
  /** Constant-quality target; `videoKbps` caps it so the file stays within the limit. */
  cq: number
  videoKbps: number
  audioKbps: number
  durationSec: number
  sizeLimitBytes: number | null
  estimatedMaxBytes: number
  fits: boolean
  grade: QualityGrade
  /** Resolution or frame rate had to go down to fit the limit. */
  reduced: boolean
  /** Longest clip that keeps the preferred resolution/fps within the limit. */
  maxDurationAtPreferred: number | null
  /** Longest clip that fits the limit at all. */
  maxDurationAtAll: number | null
}

/** Target 95% of the limit: NVENC's VBV and the MP4 container add a little on top. */
export const SAFETY_RATIO = 0.95
const CONTAINER_OVERHEAD = 0.015
/** bufsize = 1 s of maxrate, so a clip can use at most (duration + 1 s) × maxrate. */
const VBV_SECONDS = 1
export const MIN_VIDEO_KBPS = 120
const LOW_AUDIO_KBPS = 96
const LOW_AUDIO_THRESHOLD_KBPS = 900

/**
 * Bits each codec needs for the same quality, relative to HEVC. Measured with SSIM on a
 * ShadowPlay clip with NVENC: AV1 matched HEVC, H.264 needed ~25-35% more.
 */
const BITS_RELATIVE_TO_HEVC: Record<string, number> = { h264: 1.35, hevc: 1, av1: 1 }
const relativeBits = (codec: string): number => BITS_RELATIVE_TO_HEVC[codec] ?? 1.35

/** HEVC bits per pixel per frame. Below MIN, gameplay turns to mush and resolution goes down instead. */
const MIN_BPP = 0.035
const CEILING_BPP: Record<QualityLevel, number> = { max: 0.16, high: 0.11, light: 0.065 }

const CQ: Record<VideoCodec, Record<QualityLevel, number>> = {
  hevc: { max: 22, high: 25, light: 29 },
  h264: { max: 21, high: 24, light: 28 },
  av1: { max: 27, high: 31, light: 36 }
}

const HEIGHT_LADDER = [2160, 1440, 1080, 900, 720, 540, 480, 360]

interface Candidate {
  height: number
  fps: number
}

export function evenWidth(height: number, sourceWidth: number, sourceHeight: number): number {
  const aspect = sourceWidth > 0 && sourceHeight > 0 ? sourceWidth / sourceHeight : 16 / 9
  return Math.max(2, Math.round((height * aspect) / 2) * 2)
}

const usableKbps = (limitBytes: number, durationSec: number): number =>
  (limitBytes * SAFETY_RATIO * (1 - CONTAINER_OVERHEAD) * 8) / 1000 / (durationSec + VBV_SECONDS)

const durationFittingKbps = (limitBytes: number, totalKbps: number): number =>
  Math.max(0, (limitBytes * SAFETY_RATIO * (1 - CONTAINER_OVERHEAD) * 8) / 1000 / totalKbps - VBV_SECONDS)

export function estimateMaxBytes(videoKbps: number, audioKbps: number, durationSec: number): number {
  return Math.round((((videoKbps + audioKbps) * 1000) / 8) * (durationSec + VBV_SECONDS) / (1 - CONTAINER_OVERHEAD))
}

export function gradeFor(hevcBitsPerPixel: number): QualityGrade {
  if (hevcBitsPerPixel >= 0.08) return 'excelente'
  if (hevcBitsPerPixel >= 0.05) return 'buena'
  if (hevcBitsPerPixel >= 0.03) return 'aceptable'
  return 'baja'
}

/** Preferred first, then lighter options ordered by pixel rate; frame rate drops to 30 before resolution collapses. */
function candidatesFor(height: number, fps: number): Candidate[] {
  const heights = [height, ...HEIGHT_LADDER.filter((h) => h < height)]
  const rates = fps > 31 ? [fps, 30] : [fps]
  return heights
    .flatMap((h) => rates.map((rate) => ({ height: h, fps: rate })))
    .sort((a, b) => b.height * b.fps - a.height * a.fps)
}

export function planEncoding(
  durationSec: number,
  source: SourceVideoSummary,
  preferences: EncodingPreferences
): EncodingPlan {
  const duration = Math.max(durationSec, 0.1)
  const sourceHeight = source.height > 0 ? source.height : 720
  const sourceFps = source.fps > 0 ? source.fps : 30
  const preferredHeight = Math.floor(Math.min(sourceHeight, preferences.maxHeight ?? sourceHeight) / 2) * 2
  const preferredFps = Math.min(sourceFps, preferences.maxFps ?? sourceFps)
  const codecBits = relativeBits(preferences.codec)

  const pixelRate = (c: Candidate): number => evenWidth(c.height, source.width, sourceHeight) * c.height * c.fps
  const minKbpsFor = (c: Candidate): number => (pixelRate(c) * MIN_BPP * codecBits) / 1000
  const ceilingFor = (c: Candidate): number => {
    let ceiling = (pixelRate(c) * CEILING_BPP[preferences.quality] * codecBits) / 1000
    if (source.videoKbps) {
      // Spending more than the recording itself had only re-encodes its artifacts.
      const sourcePixelRate = evenWidth(sourceHeight, source.width, sourceHeight) * sourceHeight * sourceFps
      const equivalent =
        source.videoKbps * (codecBits / relativeBits(source.codec)) * (pixelRate(c) / sourcePixelRate) * 1.2
      ceiling = Math.min(ceiling, equivalent)
    }
    return Math.max(MIN_VIDEO_KBPS, Math.round(ceiling))
  }

  const candidates = candidatesFor(preferredHeight, preferredFps)
  const preferred = candidates[0]
  const limit = preferences.sizeLimitBytes
  let chosen = preferred
  let audioKbps = preferences.audioKbps
  let videoKbps = ceilingFor(preferred)
  let fits = true
  let maxDurationAtPreferred: number | null = null
  let maxDurationAtAll: number | null = null

  if (limit !== null) {
    let budget = usableKbps(limit, duration) - audioKbps
    if (budget < LOW_AUDIO_THRESHOLD_KBPS && audioKbps > LOW_AUDIO_KBPS) {
      audioKbps = LOW_AUDIO_KBPS
      budget = usableKbps(limit, duration) - audioKbps
    }
    chosen = candidates.find((c) => budget >= minKbpsFor(c)) ?? candidates[candidates.length - 1]
    fits = budget >= MIN_VIDEO_KBPS
    videoKbps = Math.max(MIN_VIDEO_KBPS, Math.floor(Math.min(budget, ceilingFor(chosen))))
    maxDurationAtPreferred = durationFittingKbps(limit, minKbpsFor(preferred) + preferences.audioKbps)
    maxDurationAtAll = durationFittingKbps(limit, MIN_VIDEO_KBPS + LOW_AUDIO_KBPS)
  }

  const width = evenWidth(chosen.height, source.width, sourceHeight)
  const hevcBpp = (videoKbps * 1000) / (width * chosen.height * chosen.fps) / codecBits

  return {
    width,
    height: chosen.height,
    fps: chosen.fps,
    codec: preferences.codec,
    cq: CQ[preferences.codec][preferences.quality],
    videoKbps,
    audioKbps,
    durationSec: duration,
    sizeLimitBytes: limit,
    estimatedMaxBytes: estimateMaxBytes(videoKbps, audioKbps, duration),
    fits,
    grade: gradeFor(hevcBpp),
    reduced: chosen !== preferred,
    maxDurationAtPreferred,
    maxDurationAtAll
  }
}

/** After an encode came out too big, how much video bitrate to try next. */
export function nextVideoKbps(
  previousKbps: number,
  producedBytes: number,
  limitBytes: number,
  audioKbps: number,
  durationSec: number
): number {
  const audioBytes = ((audioKbps * 1000) / 8) * durationSec
  const videoBytes = Math.max(1, producedBytes - audioBytes)
  const targetVideoBytes = limitBytes * 0.92 - audioBytes
  return Math.max(MIN_VIDEO_KBPS, Math.floor(previousKbps * (targetVideoBytes / videoBytes)))
}
