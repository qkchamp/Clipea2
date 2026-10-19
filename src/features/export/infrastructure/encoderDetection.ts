import { runProcess } from '@features/media/infrastructure/processRunner'
import { GPU_VENDORS, type EncoderSupport, type GpuVendor } from '../domain/encoderSupport'
import type { VideoCodec } from '../domain/encodingPlan'
import { gpuEncoderName, videoEncoderArgs } from './ffmpegCommand'

/**
 * A listed GPU encoder can still fail (no such GPU, old driver, a generation without B-frames for
 * HEVC), so each one encodes a few test frames with the exact options the export uses.
 */
async function gpuEncoderWorks(ffmpeg: string, codec: VideoCodec, gpu: GpuVendor): Promise<boolean> {
  const encoderArgs = videoEncoderArgs({
    path: '',
    width: 640,
    height: 360,
    fps: 30,
    codec,
    cq: 25,
    videoKbps: 2000,
    audioKbps: 128,
    gpu
  })
  try {
    const { code } = await runProcess(
      ffmpeg,
      ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=30:d=1', '-frames:v', '20', ...encoderArgs, '-f', 'null', '-'],
      { timeoutMs: 15_000, priority: 'background' }
    )
    return code === 0
  } catch {
    return false
  }
}

export async function detectEncoders(ffmpeg: string): Promise<EncoderSupport> {
  const listed = await runProcess(ffmpeg, ['-hide_banner', '-encoders'], { timeoutMs: 15_000 })
    .then((result) => result.stdout)
    .catch(() => '')
  const has = (name: string): boolean => new RegExp(`\\s${name}\\s`).test(listed)
  // Dedicated GPUs first; a laptop with NVIDIA + Intel graphics encodes on the NVIDIA one.
  const firstWorkingGpu = async (codec: VideoCodec): Promise<GpuVendor | null> => {
    for (const vendor of GPU_VENDORS) {
      if (has(gpuEncoderName(codec, vendor)) && (await gpuEncoderWorks(ffmpeg, codec, vendor))) return vendor
    }
    return null
  }
  const [hevc, h264, av1] = await Promise.all((['hevc', 'h264', 'av1'] as const).map(firstWorkingGpu))
  return {
    gpu: { hevc, h264, av1 },
    cpu: { hevc: has('libx265'), h264: has('libx264'), av1: has('libsvtav1') }
  }
}
