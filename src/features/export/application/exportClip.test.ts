import { describe, expect, it, vi } from 'vitest'
import { compileRenderTimeline } from '../domain/renderTimeline'
import { exportClip, fallbackLadder, MAX_ATTEMPTS, withHardwareFallback, type ExportEvents } from './exportClip'
import type { OutputFiles, RenderSpec, VideoRenderer } from './ports'

const spec: RenderSpec = {
  timeline: compileRenderTimeline([{ sourcePath: 'a.mp4', start: 0, end: 90 }], [], 1 / 30),
  audioTracks: { 'a.mp4': 1 },
  overlays: [],
  hwDecode: 'nvidia',
  output: {
    path: 'out.mp4',
    width: 1280,
    height: 720,
    fps: 30,
    codec: 'hevc',
    cq: 25,
    videoKbps: 1485,
    audioKbps: 160,
    gpu: 'nvidia'
  }
}

/** Fake encoder whose file size is proportional to the bitrate it gets, times an overshoot factor. */
function fakeRenderer(overshoot: number) {
  const bitrates: number[] = []
  let lastBytes = 0
  const renderer: VideoRenderer = {
    async render(attemptSpec, onProgress) {
      bitrates.push(attemptSpec.output.videoKbps)
      lastBytes = ((attemptSpec.output.videoKbps + attemptSpec.output.audioKbps) * 1000 / 8) * 90 * overshoot
      onProgress({ fraction: 1, speed: 3 })
    }
  }
  const files: OutputFiles = { sizeOf: async () => lastBytes, remove: vi.fn(async () => undefined) }
  return { renderer, files, bitrates }
}

const events = (): ExportEvents & { retries: number[] } => {
  const retries: number[] = []
  return { retries, progress: () => undefined, retry: ({ videoKbps }) => retries.push(videoKbps) }
}

describe('exportClip', () => {
  it('finishes in one pass when the file fits', async () => {
    const fake = fakeRenderer(1)
    const outcome = await exportClip(fake, spec, 20_000_000, events(), new AbortController().signal)
    expect(outcome).toMatchObject({ fits: true, attempts: 1 })
  })

  it('re-encodes with less bitrate when the file is over the limit', async () => {
    const fake = fakeRenderer(1.15)
    const tracker = events()
    const outcome = await exportClip(fake, spec, 20_000_000, tracker, new AbortController().signal)
    expect(outcome.fits).toBe(true)
    expect(outcome.attempts).toBe(2)
    expect(fake.bitrates[1]).toBeLessThan(fake.bitrates[0])
    expect(tracker.retries).toEqual([fake.bitrates[1]])
  })

  it('gives up after the last attempt and reports it does not fit', async () => {
    const fake = fakeRenderer(10)
    const outcome = await exportClip(fake, spec, 20_000_000, events(), new AbortController().signal)
    expect(outcome.fits).toBe(false)
    expect(outcome.attempts).toBeLessThanOrEqual(MAX_ATTEMPTS)
  })

  it('never retries without a limit', async () => {
    const fake = fakeRenderer(10)
    const outcome = await exportClip(fake, spec, null, events(), new AbortController().signal)
    expect(outcome).toMatchObject({ fits: true, attempts: 1 })
  })

  it('steps from GPU decode + encode to GPU encode only, then to the CPU', () => {
    const ladder = fallbackLadder(spec, true)
    expect(ladder.map((step) => [step.hwDecode, step.output.gpu])).toEqual([
      ['nvidia', 'nvidia'],
      [null, 'nvidia'],
      [null, null]
    ])
    expect(fallbackLadder(spec, false)).toHaveLength(2)
  })

  it('keeps encoding on the GPU when only its decoder fails', async () => {
    const used: string[] = []
    const base: VideoRenderer = {
      render: async (attemptSpec) => {
        used.push(`${attemptSpec.hwDecode}/${attemptSpec.output.gpu}`)
        if (attemptSpec.hwDecode) throw new Error('Hardware is lacking required capabilities')
      }
    }
    const fallbacks: unknown[] = []
    const renderer = withHardwareFallback(base, true, (error) => fallbacks.push(error))
    const signal = new AbortController().signal
    await renderer.render(spec, () => undefined, signal)
    await renderer.render(spec, () => undefined, signal)
    expect(used).toEqual(['nvidia/nvidia', 'null/nvidia', 'null/nvidia'])
    expect(fallbacks).toHaveLength(1)
  })

  it('falls back to the CPU when the GPU encode fails, and stays there', async () => {
    const used: boolean[] = []
    const base: VideoRenderer = {
      render: async (attemptSpec) => {
        used.push(attemptSpec.output.gpu !== null)
        if (attemptSpec.output.gpu) throw new Error('B frames not supported')
      }
    }
    const renderer = withHardwareFallback(base, true, () => undefined)
    const signal = new AbortController().signal
    await renderer.render(spec, () => undefined, signal)
    await renderer.render(spec, () => undefined, signal)
    expect(used).toEqual([true, true, false, false])
  })

  it('does not fall back when cancelled or when the CPU lacks the codec', async () => {
    const failing: VideoRenderer = {
      render: async () => {
        throw new Error('falló')
      }
    }
    const noCpu = withHardwareFallback(failing, false, () => undefined)
    await expect(noCpu.render(spec, () => undefined, new AbortController().signal)).rejects.toThrow('falló')
    const controller = new AbortController()
    controller.abort()
    const onFallback = vi.fn()
    await expect(withHardwareFallback(failing, true, onFallback).render(spec, () => undefined, controller.signal)).rejects.toThrow('falló')
    expect(onFallback).not.toHaveBeenCalled()
  })

  it('removes the partial file when encoding fails', async () => {
    const files: OutputFiles = { sizeOf: async () => 0, remove: vi.fn(async () => undefined) }
    const renderer: VideoRenderer = {
      render: async () => {
        throw new Error('cancelado')
      }
    }
    await expect(exportClip({ renderer, files }, spec, 20_000_000, events(), new AbortController().signal)).rejects.toThrow(
      'cancelado'
    )
    expect(files.remove).toHaveBeenCalledWith('out.mp4')
  })
})
