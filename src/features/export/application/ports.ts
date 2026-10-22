import type { GpuVendor } from '../domain/encoderSupport'
import type { VideoCodec } from '../domain/encodingPlan'
import type { MotionKey, RenderEffects, RenderTimeline } from '../domain/renderTimeline'

export interface RenderOutput {
  path: string
  width: number
  height: number
  fps: number
  codec: VideoCodec
  cq: number
  videoKbps: number
  audioKbps: number
  /** Hardware encoder; null encodes on the CPU. */
  gpu: GpuVendor | null
}

/** Everything needed to produce the final file. */
export interface RenderSpec {
  timeline: RenderTimeline
  /** Audio track count per source path (ShadowPlay can save game and mic separately). */
  audioTracks: Record<string, number>
  /** One transparent PNG per drawing, already at the output resolution; animated ones carry their motion, the ones with effects those. */
  overlays: Array<{ annotationId: string; pngPath: string; motion?: MotionKey[]; effects?: RenderEffects }>
  /** GPU that decodes the recordings (heavy 1440p/4K HEVC decodes ~2.5x faster); null decodes on the CPU. */
  hwDecode: GpuVendor | null
  output: RenderOutput
}

export interface RenderProgress {
  /** 0..1 of the current attempt. */
  fraction: number
  /** Encoding speed relative to real time (2.5 = 2.5x). */
  speed: number | null
}

/** Driven port: turns a RenderSpec into a video file. */
export interface VideoRenderer {
  render(spec: RenderSpec, onProgress: (progress: RenderProgress) => void, signal: AbortSignal): Promise<void>
}

/** Driven port: the finished files on disk. */
export interface OutputFiles {
  sizeOf(path: string): Promise<number>
  remove(path: string): Promise<void>
}
