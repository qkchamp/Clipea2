import { describe, expect, it } from 'vitest'
import type { RenderSpec } from '../application/ports'
import { compileRenderTimeline } from '../domain/renderTimeline'
import { buildFfmpegArgs, num, videoEncoderArgs } from './ffmpegCommand'

const output: RenderSpec['output'] = {
  path: 'C:/out/clip.mp4',
  width: 1280,
  height: 720,
  fps: 30,
  codec: 'hevc',
  cq: 25,
  videoKbps: 1485,
  audioKbps: 160,
  gpu: 'nvidia'
}

const filterOf = (args: string[]): string => args[args.indexOf('-filter_complex') + 1]

describe('num', () => {
  it('prints compact numbers', () => {
    expect(num(10)).toBe('10')
    expect(num(2.5)).toBe('2.5')
    expect(num(0)).toBe('0')
    expect(num(1 / 3)).toBe('0.333333')
  })
})

describe('buildFfmpegArgs', () => {
  it('cuts one segment like HandBrake did (seconds 50 → 60)', () => {
    const args = buildFfmpegArgs({
      timeline: compileRenderTimeline([{ sourcePath: 'C:/clip.mp4', start: 50, end: 60 }], [], 1 / 30),
      audioTracks: { 'C:/clip.mp4': 1 },
      overlays: [],
      hwDecode: null,
      output
    })
    expect(args.slice(args.indexOf('-ss'), args.indexOf('-ss') + 6)).toEqual(['-ss', '50', '-t', '10', '-i', 'C:/clip.mp4'])
    const graph = filterOf(args)
    expect(graph).toContain('[0:v:0]fps=30,scale=1280:720')
    expect(graph).toContain('trim=start=0:end=9.983333')
    expect(graph).toContain('atrim=start=0:end=10')
    expect(graph).toContain('concat=n=1:v=1:a=1[catv][cata]')
    expect(args.at(-1)).toBe('C:/out/clip.mp4')
  })

  it('splits, freezes and overlays a drawing', () => {
    const timeline = compileRenderTimeline(
      [{ sourcePath: 'a.mp4', start: 50, end: 54 }],
      [{ id: 'd1', sourcePath: 'a.mp4', time: 52, showFor: 1, freezeFor: 1.5 }],
      1 / 30
    )
    const graph = filterOf(
      buildFfmpegArgs({ timeline, audioTracks: { 'a.mp4': 1 }, overlays: [{ annotationId: 'd1', pngPath: 'd1.png' }], hwDecode: null, output })
    )
    expect(graph).toContain('split=2[s0v0][s0v1]')
    expect(graph).toContain('trim=start=0:end=2.016667,setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=1.5[p0v]')
    expect(graph).toContain('apad=whole_dur=3.533333[p0a]')
    expect(graph).toContain('trim=start=2.016667:end=3.983333')
    expect(graph).toContain("[catv][img0]overlay=0:0:enable='between(t,2,4.533333)'[ov0]")
    expect(graph).toContain('[ov0]format=yuv420p[outv]')
  })

  it('joins pieces of different recordings and fills missing audio with silence', () => {
    const timeline = compileRenderTimeline(
      [
        { sourcePath: 'a.mp4', start: 0, end: 2 },
        { sourcePath: 'b.mp4', start: 5, end: 6 }
      ],
      [],
      1 / 30
    )
    const args = buildFfmpegArgs({ timeline, audioTracks: { 'a.mp4': 2, 'b.mp4': 0 }, overlays: [], hwDecode: null, output })
    const graph = filterOf(args)
    expect(args.filter((arg) => arg === '-i')).toHaveLength(2)
    expect(graph).toContain('[0:a:0][0:a:1]amix=inputs=2')
    expect(graph).toContain('anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=1')
    expect(graph).toContain('[p0v][p0a][p1v][p1a]concat=n=2')
  })

  it('decodes every recording on the GPU, never the drawings', () => {
    const timeline = compileRenderTimeline(
      [
        { sourcePath: 'a.mp4', start: 0, end: 2 },
        { sourcePath: 'b.mp4', start: 5, end: 6 }
      ],
      [{ id: 'd1', sourcePath: 'a.mp4', time: 1, showFor: 1, freezeFor: 0 }],
      1 / 30
    )
    const overlays = [{ annotationId: 'd1', pngPath: 'd1.png' }]
    const nvidia = buildFfmpegArgs({ timeline, audioTracks: {}, overlays, hwDecode: 'nvidia', output })
    // NVIDIA keeps the frames in video memory and scales them there before the CPU filters.
    expect(nvidia.filter((arg) => arg === '-hwaccel_output_format')).toHaveLength(2)
    expect(filterOf(nvidia)).toContain('[0:v:0]scale_cuda=1280:720:force_original_aspect_ratio=decrease')
    expect(filterOf(nvidia)).toContain('hwdownload,format=yuv420p,fps=30,pad=1280:720')
    // The drawing input comes right after the last recording, with no -hwaccel of its own.
    expect(nvidia.slice(nvidia.indexOf('d1.png') - 3, nvidia.indexOf('d1.png') + 1)).toEqual(['-i', 'b.mp4', '-i', 'd1.png'])
    const intel = buildFfmpegArgs({ timeline, audioTracks: {}, overlays, hwDecode: 'intel', output })
    expect(intel.filter((arg) => arg === 'd3d11va')).toHaveLength(2)
    expect(filterOf(intel)).toContain('[0:v:0]fps=30,scale=1280:720')
  })
})

describe('videoEncoderArgs', () => {
  it('uses NVENC with a quality target capped by the size budget', () => {
    const args = videoEncoderArgs(output)
    expect(args).toEqual(expect.arrayContaining(['hevc_nvenc', '-cq', '25', '-maxrate', '1485k', '-bufsize', '1485k', 'hvc1']))
  })

  it('uses AMD AMF and Intel Quick Sync under the same cap', () => {
    expect(videoEncoderArgs({ ...output, gpu: 'amd' })).toEqual(
      expect.arrayContaining(['hevc_amf', '-rc', 'vbr_peak', '-maxrate', '1485k', 'hvc1'])
    )
    expect(videoEncoderArgs({ ...output, gpu: 'intel', codec: 'h264' })).toEqual(
      expect.arrayContaining(['h264_qsv', '-global_quality', '25', '-maxrate', '1485k', '-profile:v', 'high'])
    )
    expect(videoEncoderArgs({ ...output, gpu: 'amd', codec: 'av1' })).toEqual(expect.arrayContaining(['av1_amf', 'high_quality']))
  })

  it('falls back to the CPU without a GPU', () => {
    expect(videoEncoderArgs({ ...output, gpu: null, codec: 'h264' })).toEqual(
      expect.arrayContaining(['libx264', '-crf', '24', '-maxrate', '1485k'])
    )
  })
})
