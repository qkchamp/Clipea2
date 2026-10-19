import type { Annotation } from '@features/annotations/domain/annotation'
import type { EncoderSupport } from '@features/export/domain/encoderSupport'
import type { VideoCodec } from '@features/export/domain/encodingPlan'
import type { RenderAnnotationInput, RenderSegmentInput } from '@features/export/domain/renderTimeline'
import type { DiscordChannel, DiscordGuild, DiscordStatus, WebhookTarget } from '@features/discord/domain/discordTargets'
import type { ExportRecordDraft, HistoryEntry } from '@features/history/domain/exportRecord'
import type { LibraryScan } from '@features/library/domain/libraryClip'
import type { MediaInfo } from '@features/media/domain/mediaInfo'
import type { Segment } from '@features/montage/domain/montage'
import type { AppSettings } from '@features/settings/domain/settings'

export interface FfmpegStatus {
  found: boolean
  ffmpegPath: string | null
  version: string | null
  /** null while the NVENC check is still running (it encodes test frames, ~1 s). */
  encoders: EncoderSupport | null
}

export interface ExportRequest {
  segments: RenderSegmentInput[]
  /** Each drawing travels as a transparent PNG already rendered at the output size. */
  annotations: Array<RenderAnnotationInput & { png: Uint8Array }>
  output: {
    width: number
    height: number
    fps: number
    codec: VideoCodec
    cq: number
    videoKbps: number
    audioKbps: number
  }
  sizeLimitBytes: number | null
  /** Ajustes › Aceleración por GPU: false keeps encoding and decoding on the CPU. */
  hardwareAcceleration: boolean
  outputDir: string
  fileName: string
  /**
   * Exact file picked in the save dialog (it replaces an existing one: the dialog already asked).
   * Without it the export picks a free name in `outputDir` (re-exports from the history).
   */
  outputPath?: string
  /** Saved in the history when the export finishes, so it can be exported again. */
  record: ExportRecordDraft
}

export type ExportEvent =
  | { jobId: string; type: 'progress'; attempt: number; fraction: number; speed: number | null }
  | { jobId: string; type: 'retry'; attempt: number; previousBytes: number; videoKbps: number }
  /** The GPU failed on this clip; the export goes on handing more of the work to the CPU (slower). */
  | { jobId: string; type: 'fallback'; reason: string }
  | {
      jobId: string
      type: 'done'
      path: string
      sizeBytes: number
      fits: boolean
      attempts: number
      sizeLimitBytes: number | null
      recordId: string
    }
  | { jobId: string; type: 'error'; message: string }
  | { jobId: string; type: 'cancelled' }

export interface SessionSnapshot {
  montage: Segment[]
  annotations: Annotation[]
  lastSourcePath: string | null
}

/** Everything the renderer can ask of the main process (exposed by the preload as window.clipea2). */
export interface Clipea2Api {
  library: {
    scan(root: string): Promise<LibraryScan>
    /** Watches exactly these folders; `onChanged` fires with the folder where recordings appeared, vanished or got renamed. */
    watch(roots: string[]): Promise<void>
    onChanged(listener: (root: string) => void): () => void
  }
  media: {
    probe(path: string): Promise<MediaInfo>
    frameTimes(path: string): Promise<number[]>
    /** Media URL of a JPG preview. */
    thumbnail(path: string, atSec?: number): Promise<string>
    /** Media URLs of evenly spaced frames for the timeline. */
    filmstrip(path: string, count: number): Promise<string[]>
  }
  exporter: {
    start(request: ExportRequest): Promise<{ jobId: string }>
    cancel(jobId: string): Promise<void>
    onEvent(listener: (event: ExportEvent) => void): () => void
  }
  history: {
    /** Newest first, with whether each file still exists. */
    list(): Promise<HistoryEntry[]>
    /** Forgets the entry; the file stays on disk. */
    remove(id: string): Promise<HistoryEntry[]>
    /** Forgets every entry; the files stay on disk. */
    clear(): Promise<HistoryEntry[]>
  }
  /** The Discord app on this PC, through its local RPC (lists servers and channels; it cannot post). */
  discord: {
    status(): Promise<DiscordStatus>
    /** Saves the Client ID and Client Secret of the user's Discord application. */
    configure(clientId: string, clientSecret: string): Promise<DiscordStatus>
    /** The first time Discord asks the user to approve Clipea2. */
    connect(): Promise<DiscordStatus>
    guilds(): Promise<DiscordGuild[]>
    textChannels(guildId: string): Promise<DiscordChannel[]>
    /** Copies the clip as a file and opens the channel in Discord: the user pastes it with Ctrl+V. */
    openChannel(guildId: string, channelId: string, clipPath: string): Promise<void>
    /** Forgets the credentials and the authorization (saved webhooks stay). */
    forget(): Promise<void>
    /** Channels with direct sending (a webhook saved for them). */
    webhooks(): Promise<WebhookTarget[]>
    /** Checks the webhook belongs to that channel and keeps it, encrypted. */
    addWebhook(target: WebhookTarget, url: string): Promise<WebhookTarget[]>
    /** Just the webhook URL (no Discord app linked); `label` is how it shows in the list. */
    addWebhookUrl(url: string, label: string): Promise<WebhookTarget[]>
    removeWebhook(channelId: string): Promise<WebhookTarget[]>
    /** Posts the clip through the channel's webhook with the user's name and avatar. Works with Discord closed. */
    sendClip(channelId: string, clipPath: string): Promise<void>
  }
  settings: {
    get(): Promise<AppSettings>
    update(patch: Partial<AppSettings>): Promise<AppSettings>
  }
  session: {
    load(): Promise<SessionSnapshot | null>
    save(snapshot: SessionSnapshot): Promise<void>
  }
  system: {
    /** `waitForEncoders` false answers right away, with `encoders` null if the check is still running. */
    ffmpegStatus(waitForEncoders?: boolean): Promise<FfmpegStatus>
    openVideos(): Promise<string[]>
    chooseFolder(current?: string): Promise<string | null>
    /** Save dialog for an export: starts in `dir` with `fileName`.mp4; null when cancelled. */
    chooseExportPath(dir: string, fileName: string): Promise<string | null>
    showInFolder(path: string): Promise<void>
    openPath(path: string): Promise<void>
    /** Puts the file in the clipboard as a file, so Ctrl+V in Discord attaches it. */
    copyFileToClipboard(path: string): Promise<void>
    /** Absolute path of a file dropped on the window. */
    pathForFile(file: File): string
  }
}
