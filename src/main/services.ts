import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { app, net, safeStorage } from 'electron'
import { DiscordSession } from '@features/discord/application/discordSession'
import { DiscordWebhooks } from '@features/discord/application/discordWebhooks'
import { HttpWebhookApi } from '@features/discord/infrastructure/discordWebhookApi'
import { JsonWebhookStore } from '@features/discord/infrastructure/jsonWebhookStore'
import { exchangeCode, refreshTokens } from '@features/discord/infrastructure/discordOAuth'
import { DiscordRpcClient } from '@features/discord/infrastructure/discordRpcClient'
import { JsonDiscordAccountStore, type SecretVault } from '@features/discord/infrastructure/jsonDiscordAccountStore'
import { NO_ENCODERS, type EncoderSupport } from '@features/export/domain/encoderSupport'
import { detectEncoders } from '@features/export/infrastructure/encoderDetection'
import { ExportJobRunner } from '@features/export/infrastructure/exportJobRunner'
import { FfmpegVideoRenderer } from '@features/export/infrastructure/ffmpegVideoRenderer'
import { JsonHistoryStore } from '@features/history/infrastructure/jsonHistoryStore'
import { FsLibraryRepository } from '@features/library/infrastructure/fsLibraryRepository'
import { FsLibraryWatcher } from '@features/library/infrastructure/fsLibraryWatcher'
import type { FfmpegInstallProgress } from '@features/media/domain/ffmpegRelease'
import { locateFfmpeg, type FfmpegBinaries } from '@features/media/infrastructure/ffmpegBinaries'
import {
  fetchLatestFfmpegVersion,
  installedFfmpegDir,
  installFfmpeg,
  removeOtherFfmpegVersions
} from '@features/media/infrastructure/ffmpegInstaller'
import { FfmpegThumbnailer } from '@features/media/infrastructure/ffmpegThumbnailer'
import { FfprobeMediaProber } from '@features/media/infrastructure/ffprobeMediaProber'
import { JsonSessionStore } from '@features/session/infrastructure/jsonSessionStore'
import { defaultSettings, JsonSettingsStore } from '@features/settings/infrastructure/jsonSettingsStore'
import type { ExportEvent, FfmpegStatus } from '@shared/contracts/clipea2Api'

export interface Services {
  settings: JsonSettingsStore
  session: JsonSessionStore
  library: FsLibraryRepository
  libraryWatcher: FsLibraryWatcher
  prober: FfprobeMediaProber
  thumbnailer: FfmpegThumbnailer
  exports: ExportJobRunner
  history: JsonHistoryStore
  discord: DiscordSession
  discordWebhooks: DiscordWebhooks
  ffmpegStatus(waitForEncoders?: boolean): Promise<FfmpegStatus>
  reloadFfmpeg(): Promise<FfmpegStatus>
  latestFfmpeg(): Promise<string>
  /** One click: downloads the latest ffmpeg into Clipea2's folder and switches to it. */
  installFfmpeg(): Promise<FfmpegStatus>
  /** Cancels exports and writes pending files; run before quitting. */
  shutdown(): Promise<void>
}

interface Emitters {
  exportEvent: (event: ExportEvent) => void
  libraryChanged: (root: string) => void
  ffmpegInstallProgress: (progress: FfmpegInstallProgress) => void
}

/** Composition root: wires every adapter to its port. */
export async function createServices(emit: Emitters): Promise<Services> {
  const userData = app.getPath('userData')
  const cacheDir = join(userData, 'cache')
  const settings = new JsonSettingsStore(join(userData, 'settings.json'), defaultSettings(app.getPath('videos')))
  const ffmpegHome = join(userData, 'ffmpeg')
  const fetchUrl = (url: string): Promise<Response> => net.fetch(url)

  let binaries: FfmpegBinaries | null = null
  // GPU detection encodes test frames (~1 s); it runs in the background while the UI loads.
  let encoders: Promise<EncoderSupport> = Promise.resolve(NO_ENCODERS)
  let detected: EncoderSupport | null = null
  // Finding ffmpeg spawns a few processes: settings, library and history answer without waiting for it.
  let located: Promise<void> = Promise.resolve()
  const ffmpegPath = async (): Promise<string> => {
    await located
    return binaries?.ffmpeg ?? 'ffmpeg'
  }
  const ffprobePath = async (): Promise<string> => {
    await located
    return binaries?.ffprobe ?? 'ffprobe'
  }
  const currentEncoders = async (): Promise<EncoderSupport> => {
    await located
    return encoders
  }

  const status = async (waitForEncoders = true): Promise<FfmpegStatus> => {
    await located
    return {
      found: binaries !== null,
      ffmpegPath: binaries?.ffmpeg ?? null,
      version: binaries?.version ?? null,
      encoders: waitForEncoders ? await encoders : detected
    }
  }
  const reloadFfmpeg = async (): Promise<FfmpegStatus> => {
    const locating = (async () => {
      const [{ ffmpegDir }, installed] = await Promise.all([settings.get(), installedFfmpegDir(ffmpegHome)])
      binaries = await locateFfmpeg(ffmpegDir, installed).catch(() => null)
      detected = binaries ? null : NO_ENCODERS
      const pending = binaries ? detectEncoders(binaries.ffmpeg).catch(() => NO_ENCODERS) : Promise.resolve(NO_ENCODERS)
      encoders = pending
      void pending.then((support) => {
        if (encoders === pending) detected = support
      })
    })()
    located = locating
    await locating
    return status(false)
  }
  void reloadFfmpeg()

  // A second click while it downloads joins the same install instead of starting another one.
  let installing: Promise<FfmpegStatus> | null = null
  const installFfmpegNow = (): Promise<FfmpegStatus> => {
    installing ??= (async () => {
      try {
        const dir = await installFfmpeg({ fetchUrl, installRoot: ffmpegHome, onProgress: emit.ffmpegInstallProgress })
        // A folder chosen by hand would win over the new install: go back to finding it automatically.
        await settings.update({ ffmpegDir: null })
        const next = await reloadFfmpeg()
        await removeOtherFfmpegVersions(ffmpegHome, dir)
        return next
      } finally {
        installing = null
      }
    })()
    return installing
  }

  const prober = new FfprobeMediaProber(ffprobePath, join(cacheDir, 'frames'))
  const thumbnailer = new FfmpegThumbnailer(ffmpegPath, prober, join(cacheDir, 'thumbs'))
  // Old previews go away in the background; the cache would otherwise grow forever.
  setTimeout(() => void thumbnailer.prune().catch(() => undefined), 10_000)

  const history = new JsonHistoryStore(join(userData, 'history.json'))
  const session = new JsonSessionStore(join(userData, 'session.json'))
  const exports = new ExportJobRunner({
    renderer: new FfmpegVideoRenderer(ffmpegPath),
    prober,
    encoders: currentEncoders,
    emit: emit.exportEvent,
    recordExport: (record) => history.add(record),
    tempRoot: join(app.getPath('temp'), 'clipea2')
  })
  const libraryWatcher = new FsLibraryWatcher(emit.libraryChanged)

  // DPAPI: the Discord secret and tokens can only be read back by this Windows user.
  const vault: SecretVault = {
    seal: (text) => {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows no permite guardar la clave de Discord cifrada.')
      return safeStorage.encryptString(text).toString('base64')
    },
    open: (sealed) => safeStorage.decryptString(Buffer.from(sealed, 'base64'))
  }
  const discord = new DiscordSession({
    accounts: new JsonDiscordAccountStore(join(userData, 'discord.json'), vault),
    openRpc: (clientId) => DiscordRpcClient.open(clientId),
    exchangeCode: (account, code) => exchangeCode(account, code),
    refreshTokens: (account, refreshToken) => refreshTokens(account, refreshToken),
    now: () => Date.now()
  })
  const discordWebhooks = new DiscordWebhooks(
    new JsonWebhookStore(join(userData, 'discord-webhooks.json'), vault),
    new HttpWebhookApi(),
    async (path) => (await stat(path)).size
  )

  return {
    settings,
    session,
    library: new FsLibraryRepository(),
    libraryWatcher,
    prober,
    thumbnailer,
    exports,
    history,
    discord,
    discordWebhooks,
    ffmpegStatus: status,
    reloadFfmpeg,
    latestFfmpeg: () => fetchLatestFfmpegVersion(fetchUrl),
    installFfmpeg: installFfmpegNow,
    async shutdown() {
      libraryWatcher.stop()
      discord.disconnect()
      await exports.cancelAll()
      await Promise.all([session.flush(), settings.flush(), history.flush()])
    }
  }
}
