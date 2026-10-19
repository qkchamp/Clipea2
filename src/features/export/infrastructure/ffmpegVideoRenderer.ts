import { runProcess } from '@features/media/infrastructure/processRunner'
import type { RenderProgress, RenderSpec, VideoRenderer } from '../application/ports'
import { buildFfmpegArgs } from './ffmpegCommand'

/** Keeps the useful part of ffmpeg's stderr for the error message shown to the user. */
export function summarizeFfmpegError(stderr: string): string {
  const lines = stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  return lines.slice(-4).join(' · ') || 'ffmpeg falló sin dar detalles'
}

export class FfmpegVideoRenderer implements VideoRenderer {
  constructor(private readonly ffmpegPath: () => Promise<string>) {}

  async render(spec: RenderSpec, onProgress: (progress: RenderProgress) => void, signal: AbortSignal): Promise<void> {
    const total = Math.max(spec.timeline.totalDuration, 0.001)
    let speed: number | null = null

    const result = await runProcess(await this.ffmpegPath(), buildFfmpegArgs(spec), {
      signal,
      onStdoutLine: (line) => {
        const separator = line.indexOf('=')
        if (separator < 0) return
        const key = line.slice(0, separator)
        const value = line.slice(separator + 1).trim()
        if (key === 'speed') {
          const parsed = Number.parseFloat(value)
          speed = Number.isFinite(parsed) ? parsed : null
        } else if (key === 'out_time_us') {
          const micros = Number(value)
          if (Number.isFinite(micros) && micros >= 0) onProgress({ fraction: Math.min(1, micros / 1e6 / total), speed })
        } else if (key === 'progress' && value === 'end') {
          onProgress({ fraction: 1, speed })
        }
      }
    })
    if (result.code !== 0) throw new Error(summarizeFfmpegError(result.stderr))
  }
}
