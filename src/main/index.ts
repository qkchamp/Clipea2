import { join } from 'node:path'
import { app, BrowserWindow, Menu, shell } from 'electron'
import icon from '../../resources/icon.png?asset'
import { IPC } from '@shared/contracts/ipcChannels'
import { registerIpc } from './ipc'
import { migrateLegacyProfile } from './legacyProfile'
import { handleMediaProtocol, registerMediaScheme } from './mediaProtocol'
import { createServices, type Services } from './services'

let mainWindow: BrowserWindow | null = null
let services: Promise<Services> | null = null
/** running → stopping (window closed, exports cancelled, files flushed) → done (really quit). */
let lifecycle: 'running' | 'stopping' | 'done' = 'running'

// End-to-end tests run against a throwaway profile instead of the real settings and session.
if (process.env.CLIPEA2_USER_DATA) app.setPath('userData', process.env.CLIPEA2_USER_DATA)
else migrateLegacyProfile(app.getPath('appData'), app.getPath('userData'))
registerMediaScheme()

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1120,
    minHeight: 700,
    show: false,
    title: 'Clipea2',
    backgroundColor: '#0d0e12',
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  window.once('ready-to-show', () => window.show())
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  // Dropping a video on the window must open it in the editor, never navigate away.
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  if (!app.isPackaged) {
    window.webContents.on('before-input-event', (_event, input) => {
      if (input.type === 'keyDown' && input.key === 'F12') window.webContents.toggleDevTools()
    })
  }

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return window
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  void app.whenReady().then(() => {
    // No menu: it would steal Ctrl+R and other shortcuts the player uses.
    Menu.setApplicationMenu(null)
    handleMediaProtocol()
    // The window does not wait for ffmpeg to be found: IPC calls wait for the services instead.
    services = createServices({
      exportEvent: (event) => mainWindow?.webContents.send(IPC.exportEvent, event),
      libraryChanged: (root) => mainWindow?.webContents.send(IPC.libraryChanged, root),
      ffmpegInstallProgress: (progress) => mainWindow?.webContents.send(IPC.ffmpegInstallProgress, progress)
    })
    registerIpc(services, () => mainWindow)
    mainWindow = createWindow()
    mainWindow.on('closed', () => {
      mainWindow = null
    })
  })

  /** Closing the window first lets the renderer send its last session save (beforeunload). */
  const closeWindow = (): Promise<void> =>
    new Promise((resolve) => {
      const window = mainWindow
      if (!window || window.isDestroyed()) return resolve()
      window.once('closed', () => setTimeout(resolve, 50))
      window.close()
    })

  // Quitting waits (bounded) for cancelled exports to remove their partial files and for the
  // last session/settings writes to reach the disk.
  app.on('before-quit', (event) => {
    if (lifecycle === 'done' || !services) return
    event.preventDefault()
    if (lifecycle === 'stopping') return
    lifecycle = 'stopping'
    const ready = services
    void closeWindow()
      .then(() => ready)
      .then((started) => started.shutdown())
      .catch(() => undefined)
      .finally(() => {
        lifecycle = 'done'
        app.quit()
      })
  })
  app.on('window-all-closed', () => {
    if (lifecycle === 'running') app.quit()
  })
}
