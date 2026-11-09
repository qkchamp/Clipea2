import type { GpuVendor } from '@features/export/domain/encoderSupport'
import type { ConversionPlan } from '../domain/playbackPlan'

export interface ConversionSpec {
  input: string
  output: string
  plan: ConversionPlan
  /** Hardware H.264 encoder; null encodes on the CPU. */
  gpu: GpuVendor | null
  /** Frame rate of the video: a keyframe goes in every half second of it. */
  fps: number
}

/**
 * Speed first: this copy is only watched inside the app (exports read the original file), and the
 * wait before the first frame is what the user notices.
 */
function h264Args(gpu: GpuVendor | null): string[] {
  switch (gpu) {
    case 'nvidia':
      return ['-c:v', 'h264_nvenc', '-preset', 'p2', '-rc', 'vbr', '-cq', '21', '-b:v', '0', '-pix_fmt', 'yuv420p']
    case 'amd':
      return ['-c:v', 'h264_amf', '-quality', 'speed', '-rc', 'cqp', '-qp_i', '20', '-qp_p', '22', '-pix_fmt', 'yuv420p']
    case 'intel':
      return ['-c:v', 'h264_qsv', '-preset', 'veryfast', '-global_quality', '22', '-pix_fmt', 'nv12']
    case null:
      return ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p']
  }
}

/**
 * An MP4 with H.264 and AAC out of anything ffmpeg reads.
 *
 * Encoding keeps every frame at its own time (`vfr`: nothing is duplicated to fill a constant rate),
 * so the frame table read from the copy is the one of the frames on screen. Short groups of pictures
 * make stepping back a frame cheap: at most half a second is decoded again.
 */
export function conversionArgs(spec: ConversionSpec): string[] {
  const { plan } = spec
  const args = ['-hide_banner', '-nostdin', '-y', '-loglevel', 'error', '-progress', 'pipe:1', '-nostats']
  args.push('-i', spec.input, '-map', '0:v:0')
  if (plan.audio !== 'none') args.push('-map', '0:a?')
  args.push('-sn', '-dn')

  if (plan.video === 'copy') {
    args.push('-c:v', 'copy')
  } else {
    const keyframeEvery = Math.max(1, Math.round((spec.fps > 0 ? spec.fps : 30) / 2))
    // H.264 4:2:0 needs even sides (old captures and GIF-like clips come with odd ones).
    args.push('-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', ...h264Args(spec.gpu), '-g', String(keyframeEvery), '-fps_mode', 'vfr')
  }
  if (plan.audio === 'copy') args.push('-c:a', 'copy')
  // Stereo: every layout downmixes to it, and 7.1 or DTS oddities would otherwise stop the AAC encoder.
  else if (plan.audio === 'encode') args.push('-c:a', 'aac', '-b:a', '192k', '-ac', '2')

  args.push('-map_metadata', '-1', '-f', 'mp4', spec.output)
  return args
}
