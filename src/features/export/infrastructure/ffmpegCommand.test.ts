import { describe, expect, it } from 'vitest'
import type { RenderSpec } from '../application/ports'
import { compileRenderTimeline } from '../domain/renderTimeline'
import { buildFfmpegArgs, videoEncoderArgs } from './ffmpegCommand'
import { evaluateExpression } from './ffmpegExpression.testkit'
import { num } from './num'

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
  it('cuts one segment (seconds 50 → 60)', () => {
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

  it('overlays a drawing during its window', () => {
    const timeline = compileRenderTimeline(
      [{ sourcePath: 'a.mp4', start: 50, end: 54 }],
      [{ id: 'd1', sourcePath: 'a.mp4', start: 52, end: 53.5 }],
      1 / 30
    )
    const graph = filterOf(
      buildFfmpegArgs({ timeline, audioTracks: { 'a.mp4': 1 }, overlays: [{ annotationId: 'd1', pngPath: 'd1.png' }], hwDecode: null, output })
    )
    expect(graph).toContain('trim=start=0:end=3.983333,setpts=PTS-STARTPTS[p0v]')
    expect(graph).toContain('apad=whole_dur=4[p0a]')
    // Half a frame early on both edges: frames 2 s … 3.5 s - 1 frame, the same ones the player shows.
    expect(graph).toContain("[catv][img0]overlay=0:0:enable='gte(t,1.983333)*lt(t,3.483333)'[ov0]")
    expect(graph).toContain('[ov0]format=yuv420p[outv]')
  })

  it('slides an animated drawing along its keyframes, in source time', () => {
    const timeline = compileRenderTimeline(
      [{ sourcePath: 'a.mp4', start: 50, end: 54 }],
      [{ id: 'd1', sourcePath: 'a.mp4', start: 51, end: 53 }],
      1 / 30
    )
    const motion = [
      { time: 51, dx: 0, dy: 0 },
      { time: 52, dx: 0.5, dy: -0.25 }
    ]
    const graph = filterOf(
      buildFfmpegArgs({ timeline, audioTracks: { 'a.mp4': 1 }, overlays: [{ annotationId: 'd1', pngPath: 'd1.png', motion }], hwDecode: null, output })
    )
    // Clip second 1 is source second 51: x goes 0 → 640 px (half of 1280) by source second 52, y 0 → -180.
    const window = 'gte(t,0.983333)*lt(t,2.983333)'
    expect(graph).toContain(`overlay=x='if(${window},if(lt((t+(50)),51),0,if(lt((t+(50)),52),0+(640)*((t+(50))-(51)),640)),0)'`)
    expect(graph).toContain(`y='if(${window},if(lt((t+(50)),51),0,if(lt((t+(50)),52),0+(-180)*((t+(50))-(51)),-180)),0)'`)
    expect(graph).toContain(`:enable='${window}'[ov0]`)
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
      [{ id: 'd1', sourcePath: 'a.mp4', start: 1, end: 2 }],
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
    expect(videoEncoderArgs({ ...output, gpu: null })).toEqual(
      expect.arrayContaining(['libx265', '-crf', '22', '-maxrate', '1485k', 'hvc1'])
    )
    expect(videoEncoderArgs({ ...output, gpu: null, codec: 'h264' })).toEqual(
      expect.arrayContaining(['libx264', '-crf', '22', '-maxrate', '1485k'])
    )
  })
})

describe('drawings with effects', () => {
  const timeline = compileRenderTimeline(
    [{ sourcePath: 'a.mp4', start: 50, end: 56 }],
    [{ id: 'd1', sourcePath: 'a.mp4', start: 52, end: 55 }],
    1 / 30
  )
  const effects = {
    start: 52,
    end: 55,
    center: { x: 0.5, y: 0.5 },
    list: [{ kind: 'fadeIn' as const, duration: 1 }]
  }
  const build = (overlay: Partial<RenderSpec['overlays'][number]>) =>
    buildFfmpegArgs({ timeline, audioTracks: { 'a.mp4': 1 }, overlays: [{ annotationId: 'd1', pngPath: 'd1.png', ...overlay }], hwDecode: null, output })

  it('shows a drawing on exactly the frames the player shows it on', () => {
    // 3 s at 30 fps from clip second 2: frames 60 … 149. The one that starts exactly at its end is not among them.
    const enable = /enable='([^']+)'/.exec(filterOf(build({})))?.[1] ?? ''
    const shown: number[] = []
    for (let frame = 0; frame < 180; frame++) {
      // The encoder's own clock: frame * (1 / 30), with its rounding.
      if (evaluateExpression(enable, { t: frame * (1 / 30) }) !== 0) shown.push(frame)
    }
    expect(shown[0]).toBe(60)
    expect(shown.at(-1)).toBe(149)
    expect(shown).toHaveLength(90)
  })

  it('reads a fading drawing as frames at the clip rate, only where it shows', () => {
    const args = build({ effects })
    const graph = filterOf(args)
    const at = args.indexOf('d1.png')
    expect(args.slice(at - 3, at + 1)).toEqual(['-framerate', '30', '-i', 'd1.png'])
    // Frames 59 … 150 of the clip (the drawing shows from 60 to 149), one more on each side.
    expect(graph).toContain('tpad=stop_mode=clone:stop_duration=3.033333,trim=end_frame=92,setpts=(N/30+1.966667)/TB+0.5')
    expect(graph).toContain('[alpha0]alphaextract[shape0]')
    expect(graph).toContain("color=c=white:s=16x16:r=30:d=3.066667,setpts=(N/30+1.966667)/TB+0.5,format=gray,geq=lum='255*(")
    expect(graph).toContain('[fade0][shape0]blend=all_mode=multiply[mask0]')
    expect(graph).toContain('[rgb0][mask0]alphamerge[img0]')
    expect(graph).toContain("[catv][img0]overlay=0:0:enable='gte(t,1.983333)*lt(t,4.983333)'[ov0]")
  })

  it('scales a zooming drawing frame by frame around the middle of its shape', () => {
    const graph = filterOf(build({ effects: { ...effects, list: [{ kind: 'zoomIn', duration: 0.5 }] } }))
    expect(graph).toContain('[still0]scale=w=\'max(2,iw*(if(')
    expect(graph).toContain(":eval=frame[img0]")
    expect(graph).not.toContain('geq=')
    expect(graph).toContain("overlay=x='if(")
    // 640 is the middle of the frame (0.5 of 1280): the image grows from its corner and this moves it back.
    expect(graph).toContain('640*(1-(1-pow(1-clip(')
  })

  it('slides a drawing without turning it into frames', () => {
    const args = build({ effects: { ...effects, list: [{ kind: 'slideIn', duration: 0.5, side: 'left' }] } })
    expect(args).not.toContain('-framerate')
    const graph = filterOf(args)
    expect(graph).toContain('[1:v]scale=1280:720,format=rgba[img0]')
    expect(graph).toContain("x='if(")
    expect(graph).toContain('*1280)')
  })

  it('adds up keyframe motion and effects on the same drawing', () => {
    const motion = [
      { time: 52, dx: 0, dy: 0 },
      { time: 54, dx: 0.5, dy: 0 }
    ]
    const graph = filterOf(build({ motion, effects: { ...effects, list: [{ kind: 'slideIn', duration: 0.5, side: 'top' }] } }))
    expect(graph).toContain('if(lt((t+(50)),52),0,')
    expect(graph).toContain('(-(1-(1-pow(1-clip(')
  })

  it('ignores effects that make no sense instead of putting them in the filter graph', () => {
    const hostile = {
      start: 52,
      end: 55,
      center: { x: 0.5, y: 0.5 },
      list: [{ kind: 'fadeIn', duration: "1)',evil='" }, { kind: 'explode' }] as never
    }
    const args = build({ effects: hostile })
    expect(args).not.toContain('-framerate')
    expect(filterOf(args)).not.toMatch(/evil|geq|explode/)
    const noCenter = build({ effects: { ...effects, center: { x: Number.NaN, y: 0.5 } } })
    expect(filterOf(noCenter)).not.toContain('geq=')
  })
})
