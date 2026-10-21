import type { RenderOutput, RenderSpec } from '../application/ports'
import type { GpuVendor } from '../domain/encoderSupport'
import type { VideoCodec } from '../domain/encodingPlan'
import type { MotionKey, OverlayWindow } from '../domain/renderTimeline'

const GPU_SUFFIX: Record<GpuVendor, string> = { nvidia: 'nvenc', amd: 'amf', intel: 'qsv' }
/**
 * Decoding flags per GPU. On NVIDIA the frames stay in video memory and are scaled there
 * (scale_cuda: ~1.5x faster export from 1440p sources); AMD and Intel decode through DXVA and hand
 * the frames to the CPU filters.
 */
const HWACCEL: Record<GpuVendor, string[]> = {
  nvidia: ['-hwaccel', 'cuda', '-hwaccel_output_format', 'cuda'],
  amd: ['-hwaccel', 'd3d11va'],
  intel: ['-hwaccel', 'd3d11va']
}

/** Same size and frame rate for every piece: fit inside the output, black bars, square pixels. */
function normalizeChain(output: RenderOutput, hwDecode: GpuVendor | null): string {
  const fit = `${output.width}:${output.height}:force_original_aspect_ratio=decrease`
  const finish = `pad=${output.width}:${output.height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,format=yuv420p`
  if (hwDecode === 'nvidia') {
    return `scale_cuda=${fit}:force_divisible_by=2:interp_algo=lanczos:format=yuv420p,hwdownload,format=yuv420p,fps=${num(output.fps)},${finish}`
  }
  return `fps=${num(output.fps)},scale=${fit}:flags=lanczos,${finish}`
}

/** "hevc_nvenc", "h264_amf", "av1_qsv"… */
export function gpuEncoderName(codec: VideoCodec, vendor: GpuVendor): string {
  return `${codec}_${GPU_SUFFIX[vendor]}`
}

/** ffmpeg-friendly number: fixed precision without trailing zeros. */
export function num(value: number): string {
  return value.toFixed(6).replace(/\.?0+$/, '') || '0'
}

/** ffmpeg expression of a value that goes linearly from key to key along `time` (held before the first and after the last). */
function piecewiseLinear(keys: readonly { time: number; value: number }[], time: string): string {
  let expression = num(keys[keys.length - 1].value)
  for (let index = keys.length - 2; index >= 0; index--) {
    const a = keys[index]
    const b = keys[index + 1]
    const slope = (b.value - a.value) / (b.time - a.time)
    expression = `if(lt(${time},${num(b.time)}),${num(a.value)}+(${num(slope)})*(${time}-(${num(a.time)})),${expression})`
  }
  return `if(lt(${time},${num(keys[0].time)}),${num(keys[0].value)},${expression})`
}

/**
 * Overlay position of an animated drawing in pixels: inside each window the clip time `t` maps back
 * to the source time its keyframes use.
 */
function motionExpression(windows: readonly OverlayWindow[], motion: readonly MotionKey[], axis: 'dx' | 'dy', size: number): string {
  const keys = motion.map((key) => ({ time: key.time, value: key[axis] * size }))
  return windows.reduceRight(
    (rest, window) =>
      `if(between(t,${num(window.start)},${num(window.end)}),${piecewiseLinear(keys, `(t+(${num(window.sourceStart - window.start)}))`)},${rest})`,
    '0'
  )
}

function audioSource(input: number, tracks: number, duration: number): string {
  const format = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo'
  if (tracks <= 0) return `anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=${num(duration)},${format}`
  if (tracks === 1) return `[${input}:a:0]${format}`
  const inputs = Array.from({ length: tracks }, (_, track) => `[${input}:a:${track}]`).join('')
  return `${inputs}amix=inputs=${tracks}:duration=longest:normalize=0,${format}`
}

/**
 * Every GPU gets "best quality under the cap": NVENC and Quick Sync aim at a constant quality and
 * never pass maxrate; AMF has no such mode on every driver, so it aims a little under the cap.
 * NVENC p4 encodes twice as fast as p6 for ~0.2 dB less (SSIM 0.9622 vs 0.9640 at the same size).
 */
function gpuEncoderArgs(output: RenderOutput, vendor: GpuVendor, kbps: number): string[] {
  const rate = ['-maxrate', `${kbps}k`, '-bufsize', `${kbps}k`]
  const target = ['-b:v', `${Math.max(1, Math.round(kbps * 0.85))}k`]
  // hvc1 tag: without it iOS (and Discord on iPhone) refuses to play HEVC in MP4.
  const profile = output.codec === 'hevc' ? ['-profile:v', 'main', '-tag:v', 'hvc1'] : output.codec === 'h264' ? ['-profile:v', 'high'] : []
  const encoder = ['-c:v', gpuEncoderName(output.codec, vendor)]
  switch (vendor) {
    case 'nvidia':
      return [
        ...encoder,
        '-preset', 'p4', '-tune', 'hq', '-rc', 'vbr', '-cq', String(output.cq), '-b:v', '0', ...rate,
        '-spatial-aq', '1', '-temporal-aq', '1', '-rc-lookahead', '32', '-bf', '3', '-b_ref_mode', 'middle',
        '-pix_fmt', 'yuv420p', ...profile
      ]
    case 'amd':
      return [...encoder, '-quality', output.codec === 'av1' ? 'high_quality' : 'quality', '-rc', 'vbr_peak', ...target, ...rate, '-pix_fmt', 'yuv420p', ...profile]
    case 'intel':
      // global_quality plus maxrate selects QVBR: constant quality with a ceiling.
      return [...encoder, '-preset', 'slow', '-global_quality', String(output.cq), ...target, ...rate, '-pix_fmt', 'nv12', ...profile]
  }
}

/**
 * Without a GPU. Calibrated against NVENC with VMAF on 15 s clips: at cq - 3, x265 and x264 medium
 * land within about half a point of it, and VBV keeps them under the cap. SVT-AV1 doesn't hold maxrate strictly (7% over it at
 * cq + 1), so it keeps cq + 4 to stay within the size limit.
 */
export function videoEncoderArgs(output: RenderOutput): string[] {
  const kbps = Math.max(1, Math.round(output.videoKbps))
  const rate = ['-maxrate', `${kbps}k`, '-bufsize', `${kbps}k`]
  if (output.gpu) return gpuEncoderArgs(output, output.gpu, kbps)
  switch (output.codec) {
    case 'hevc':
      return ['-c:v', 'libx265', '-preset', 'medium', '-crf', String(output.cq - 3), ...rate, '-pix_fmt', 'yuv420p', '-tag:v', 'hvc1']
    case 'h264':
      return ['-c:v', 'libx264', '-preset', 'medium', '-crf', String(output.cq - 3), ...rate, '-pix_fmt', 'yuv420p', '-profile:v', 'high']
    case 'av1':
      return ['-c:v', 'libsvtav1', '-preset', '8', '-crf', String(output.cq + 4), ...rate, '-pix_fmt', 'yuv420p']
  }
}

/**
 * One input per segment (fast, frame-accurate input seeking), normalised to the output size and
 * frame rate, concatenated, then the drawings are overlaid during their windows.
 *
 * Cuts work in whole output frames: video trims at half-frame boundaries so exactly the intended
 * frames are kept, audio trims at the matching frame boundaries so both stay in sync.
 */
export function buildFfmpegArgs(spec: RenderSpec): string[] {
  const { timeline, output } = spec
  const fps = output.fps
  const args = ['-hide_banner', '-nostdin', '-y', '-loglevel', 'error', '-progress', 'pipe:1', '-nostats']

  const hwaccel = spec.hwDecode ? HWACCEL[spec.hwDecode] : []
  for (const segment of timeline.segments) {
    args.push(...hwaccel, '-ss', num(segment.start), '-t', num(segment.end - segment.start), '-i', segment.sourcePath)
  }
  const overlayBase = timeline.segments.length
  for (const overlay of spec.overlays) args.push('-i', overlay.pngPath)

  const normalize = normalizeChain(output, spec.hwDecode)
  const graph: string[] = []
  const concatInputs: string[] = []

  timeline.segments.forEach((segment, input) => {
    const tracks = spec.audioTracks[segment.sourcePath] ?? 0
    const frames = Math.max(1, Math.round((segment.end - segment.start) * fps))
    graph.push(`[${input}:v:0]${normalize},trim=start=0:end=${num((frames - 0.5) / fps)},setpts=PTS-STARTPTS[p${input}v]`)
    graph.push(
      `${audioSource(input, tracks, segment.end - segment.start)},atrim=start=0:end=${num(frames / fps)},asetpts=PTS-STARTPTS,` +
        `apad=whole_dur=${num(frames / fps)}[p${input}a]`
    )
    concatInputs.push(`[p${input}v][p${input}a]`)
  })

  graph.push(`${concatInputs.join('')}concat=n=${concatInputs.length}:v=1:a=1[catv][cata]`)

  let videoLabel = 'catv'
  spec.overlays.forEach((overlay, index) => {
    const windows = timeline.overlays.filter((window) => window.annotationId === overlay.annotationId)
    if (windows.length === 0) return
    const enable = windows.map((window) => `between(t,${num(window.start)},${num(window.end)})`).join('+')
    const position =
      overlay.motion && overlay.motion.length >= 2
        ? `x='${motionExpression(windows, overlay.motion, 'dx', output.width)}':y='${motionExpression(windows, overlay.motion, 'dy', output.height)}'`
        : '0:0'
    graph.push(`[${overlayBase + index}:v]scale=${output.width}:${output.height},format=rgba[img${index}]`)
    graph.push(`[${videoLabel}][img${index}]overlay=${position}:enable='${enable}'[ov${index}]`)
    videoLabel = `ov${index}`
  })
  graph.push(`[${videoLabel}]format=yuv420p[outv]`)

  args.push('-filter_complex', graph.join(';'), '-map', '[outv]', '-map', '[cata]')
  args.push(...videoEncoderArgs(output))
  args.push('-c:a', 'aac', '-b:a', `${output.audioKbps}k`, '-ar', '48000', '-ac', '2')
  args.push('-fps_mode', 'cfr', '-movflags', '+faststart', '-map_metadata', '-1', output.path)
  return args
}
