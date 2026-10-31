import { join } from 'node:path'
import { BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import { uniqueOutputPath } from '@features/export/infrastructure/outputNaming'
import { scanLibrary } from '@features/library/application/scanLibrary'
import { VIDEO_EXTENSIONS } from '@features/library/domain/libraryClip'
import type { AppSettings } from '@features/settings/domain/settings'
import type { ExportRequest, SessionSnapshot } from '@shared/contracts/clipea2Api'
import { IPC } from '@shared/contracts/ipcChannels'
import { getT, setLanguage } from '@shared/i18n'
import { toMediaUrl } from '@shared/contracts/mediaUrl'
import type { Services } from './services'
import { copyFileToClipboard, prepareFileCopy } from './windowsClipboard'

/**
 * Driving adapter: exposes the use cases to the renderer. Handlers are registered before the
 * services finish starting (finding ffmpeg takes a moment), so the window can show right away;
 * each call simply waits for them.
 */
export function registerIpc(services: Promise<Services>, getWindow: () => BrowserWindow | null): void {
  const handle = <Args extends unknown[], Result>(
    channel: string,
    handler: (s: Services, ...args: Args) => Result | Promise<Result>
  ): void => {
    ipcMain.handle(channel, async (_event: IpcMainInvokeEvent, ...args: unknown[]) => handler(await services, ...(args as Args)))
  }

  handle(IPC.libraryScan, (s, root: string) => scanLibrary(s.library, root))
  handle(IPC.libraryWatch, (s, roots: string[]) => s.libraryWatcher.watch(roots))

  handle(IPC.mediaProbe, (s, path: string) => s.prober.probe(path))
  handle(IPC.mediaFrameTimes, (s, path: string) => s.prober.frameTimes(path))
  handle(IPC.mediaThumbnail, async (s, path: string, atSec?: number) => toMediaUrl(await s.thumbnailer.thumbnail(path, atSec)))
  handle(IPC.mediaFilmstrip, async (s, path: string, count: number) => (await s.thumbnailer.filmstrip(path, count)).map(toMediaUrl))

  handle(IPC.exportStart, (s, request: ExportRequest) => ({ jobId: s.exports.start(request) }))
  handle(IPC.exportCancel, (s, jobId: string) => s.exports.cancel(jobId))

  handle(IPC.historyList, (s) => {
    // The exports are on screen: «Copiar para Discord» answers right away.
    prepareFileCopy()
    return s.history.list()
  })
  handle(IPC.historyRemove, (s, id: string) => s.history.remove(id))
  handle(IPC.historyClear, (s) => s.history.clear())

  handle(IPC.discordWebhooks, (s) => s.discordWebhooks.targets())
  handle(IPC.discordAddWebhookUrl, (s, url: string, label: string) => s.discordWebhooks.addByUrl(url, label))
  handle(IPC.discordEditWebhook, (s, channelId: string, url: string, label: string) => s.discordWebhooks.edit(channelId, url, label))
  handle(IPC.discordRemoveWebhook, (s, channelId: string) => s.discordWebhooks.remove(channelId))
  handle(IPC.discordSendClip, async (s, channelId: string, clipPath: string) => {
    await s.discordWebhooks.send(channelId, clipPath)
  })

  handle(IPC.settingsGet, (s) => s.settings.get())
  handle(IPC.settingsUpdate, async (s, patch: Partial<AppSettings>) => {
    const next = await s.settings.update(patch)
    // Errors and dialogs from here on speak the language just picked.
    setLanguage(next.language)
    if ('ffmpegDir' in patch) await s.reloadFfmpeg()
    return next
  })

  handle(IPC.sessionLoad, (s) => s.session.load())
  handle(IPC.sessionSave, (s, snapshot: SessionSnapshot) => s.session.save(snapshot))

  handle(IPC.ffmpegStatus, (s, waitForEncoders?: boolean) => s.ffmpegStatus(waitForEncoders !== false))
  handle(IPC.ffmpegLatest, (s) => s.latestFfmpeg())
  handle(IPC.ffmpegInstall, (s) => s.installFfmpeg())

  handle(IPC.openVideos, async (s) => {
    const window = getWindow()
    const { libraryRoots } = await s.settings.get()
    const options: Electron.OpenDialogOptions = {
      title: getT().system.openVideo,
      defaultPath: libraryRoots[0],
      properties: ['openFile'],
      filters: [{ name: getT().system.videos, extensions: VIDEO_EXTENSIONS.map((extension) => extension.slice(1)) }]
    }
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
    return result.canceled ? [] : result.filePaths
  })
  ipcMain.handle(IPC.chooseExportPath, async (_event, dir: string, fileName: string, freeName: boolean) => {
    const window = getWindow()
    const options: Electron.SaveDialogOptions = {
      title: getT().system.saveClip,
      defaultPath: freeName ? uniqueOutputPath(dir, fileName) : join(dir, `${fileName}.mp4`),
      filters: [{ name: getT().system.mp4Video, extensions: ['mp4'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation']
    }
    const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return null
    return /\.mp4$/i.test(result.filePath) ? result.filePath : `${result.filePath}.mp4`
  })
  ipcMain.handle(IPC.chooseFolder, async (_event, current?: string) => {
    const window = getWindow()
    const options: Electron.OpenDialogOptions = { defaultPath: current, properties: ['openDirectory', 'createDirectory'] }
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  ipcMain.handle(IPC.showInFolder, (_event, path: string) => shell.showItemInFolder(path))
  ipcMain.handle(IPC.openPath, async (_event, path: string) => {
    await shell.openPath(path)
  })
  ipcMain.handle(IPC.copyFile, (_event, path: string) => copyFileToClipboard(path))
}
