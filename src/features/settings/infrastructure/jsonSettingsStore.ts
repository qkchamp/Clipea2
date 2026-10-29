import { join } from 'node:path'
import { AtomicJsonFile } from '@shared/infrastructure/atomicJsonFile'
import { mergeSettings, type AppSettings } from '../domain/settings'

export function defaultSettings(videosDir: string): AppSettings {
  const nvidia = join(videosDir, 'NVIDIA')
  return {
    libraryRoots: [nvidia],
    // Discord-ready exports live next to the recordings.
    outputDir: join(nvidia, 'PARA_DISCORD'),
    ffmpegDir: null,
    hardwareAcceleration: true,
    classicTimeline: false,
    codec: 'hevc',
    quality: 'high',
    maxHeight: 720,
    maxFps: 30,
    audioKbps: 160,
    sizeLimitMb: 20
  }
}

export class JsonSettingsStore {
  private current: AppSettings | null = null
  private readonly file: AtomicJsonFile

  constructor(
    filePath: string,
    private readonly defaults: AppSettings
  ) {
    this.file = new AtomicJsonFile(filePath, 2)
  }

  async get(): Promise<AppSettings> {
    if (this.current) return this.current
    const stored = await this.file.read()
    this.current = mergeSettings(this.defaults, stored && typeof stored === 'object' ? (stored as Record<string, unknown>) : {})
    return this.current
  }

  /** Clicking through options quickly queues the writes; the file is never half written. */
  async update(patch: Record<string, unknown>): Promise<AppSettings> {
    const next = mergeSettings(await this.get(), patch)
    this.current = next
    await this.file.write(next)
    return next
  }

  flush(): Promise<void> {
    return this.file.flush()
  }
}
