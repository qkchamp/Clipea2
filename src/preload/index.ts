import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { FfmpegInstallProgress } from '../features/media/domain/ffmpegRelease'
import type { Clipea2Api, ExportEvent } from '../shared/contracts/clipea2Api'
import { IPC } from '../shared/contracts/ipcChannels'

const api: Clipea2Api = {
  library: {
    scan: (root) => ipcRenderer.invoke(IPC.libraryScan, root),
    watch: (roots) => ipcRenderer.invoke(IPC.libraryWatch, roots),
    onChanged: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, root: string): void => listener(root)
      ipcRenderer.on(IPC.libraryChanged, handler)
      return () => ipcRenderer.removeListener(IPC.libraryChanged, handler)
    }
  },
  media: {
    probe: (path) => ipcRenderer.invoke(IPC.mediaProbe, path),
    frameTimes: (path) => ipcRenderer.invoke(IPC.mediaFrameTimes, path),
    thumbnail: (path, atSec) => ipcRenderer.invoke(IPC.mediaThumbnail, path, atSec),
    filmstrip: (path, count) => ipcRenderer.invoke(IPC.mediaFilmstrip, path, count)
  },
  exporter: {
    start: (request) => ipcRenderer.invoke(IPC.exportStart, request),
    cancel: (jobId) => ipcRenderer.invoke(IPC.exportCancel, jobId),
    onEvent: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: ExportEvent): void => listener(payload)
      ipcRenderer.on(IPC.exportEvent, handler)
      return () => ipcRenderer.removeListener(IPC.exportEvent, handler)
    }
  },
  history: {
    list: () => ipcRenderer.invoke(IPC.historyList),
    remove: (id) => ipcRenderer.invoke(IPC.historyRemove, id),
    clear: () => ipcRenderer.invoke(IPC.historyClear)
  },
  discord: {
    status: () => ipcRenderer.invoke(IPC.discordStatus),
    configure: (clientId, clientSecret) => ipcRenderer.invoke(IPC.discordConfigure, clientId, clientSecret),
    connect: () => ipcRenderer.invoke(IPC.discordConnect),
    guilds: () => ipcRenderer.invoke(IPC.discordGuilds),
    textChannels: (guildId) => ipcRenderer.invoke(IPC.discordChannels, guildId),
    openChannel: (guildId, channelId, clipPath) => ipcRenderer.invoke(IPC.discordOpenChannel, guildId, channelId, clipPath),
    forget: () => ipcRenderer.invoke(IPC.discordForget),
    webhooks: () => ipcRenderer.invoke(IPC.discordWebhooks),
    addWebhook: (target, url) => ipcRenderer.invoke(IPC.discordAddWebhook, target, url),
    addWebhookUrl: (url, label) => ipcRenderer.invoke(IPC.discordAddWebhookUrl, url, label),
    removeWebhook: (channelId) => ipcRenderer.invoke(IPC.discordRemoveWebhook, channelId),
    sendClip: (channelId, clipPath) => ipcRenderer.invoke(IPC.discordSendClip, channelId, clipPath)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    update: (patch) => ipcRenderer.invoke(IPC.settingsUpdate, patch)
  },
  session: {
    load: () => ipcRenderer.invoke(IPC.sessionLoad),
    save: (snapshot) => ipcRenderer.invoke(IPC.sessionSave, snapshot)
  },
  system: {
    ffmpegStatus: (waitForEncoders) => ipcRenderer.invoke(IPC.ffmpegStatus, waitForEncoders ?? true),
    ffmpegLatest: () => ipcRenderer.invoke(IPC.ffmpegLatest),
    installFfmpeg: () => ipcRenderer.invoke(IPC.ffmpegInstall),
    onFfmpegInstallProgress: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: FfmpegInstallProgress): void => listener(progress)
      ipcRenderer.on(IPC.ffmpegInstallProgress, handler)
      return () => ipcRenderer.removeListener(IPC.ffmpegInstallProgress, handler)
    },
    openVideos: () => ipcRenderer.invoke(IPC.openVideos),
    chooseFolder: (current) => ipcRenderer.invoke(IPC.chooseFolder, current),
    chooseExportPath: (dir, fileName) => ipcRenderer.invoke(IPC.chooseExportPath, dir, fileName),
    showInFolder: (path) => ipcRenderer.invoke(IPC.showInFolder, path),
    openPath: (path) => ipcRenderer.invoke(IPC.openPath, path),
    copyFileToClipboard: (path) => ipcRenderer.invoke(IPC.copyFile, path),
    pathForFile: (file) => webUtils.getPathForFile(file)
  }
}

contextBridge.exposeInMainWorld('clipea2', api)
