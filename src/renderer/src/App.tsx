import { useEffect } from 'react'
import { Download, TriangleAlert } from 'lucide-react'
import { formatBytes } from '@shared/domain/time'
import { api } from '@shared/ui/api'
import { Button } from '@shared/ui/atoms'
import { Tabs } from '@shared/ui/molecules'
import { InstantTooltip } from '@shared/ui/organisms/InstantTooltip'
import { Toasts } from '@shared/ui/organisms/Toasts'
import { useUiStore } from '@shared/ui/uiStore'
import { AnnotationList } from '@features/annotations/ui/AnnotationList'
import { SendToChannelDialog } from '@features/discord/ui/SendToChannelDialog'
import { ExportPanel } from '@features/export/ui/ExportPanel'
import { useExportStore } from '@features/export/ui/exportStore'
import { HistoryPanel } from '@features/history/ui/HistoryPanel'
import { useHistoryStore } from '@features/history/ui/historyStore'
import { baseName, describeRecording, formatRecordedAt } from '@features/library/domain/libraryClip'
import { LibraryPanel, openRecording } from '@features/library/ui/LibraryPanel'
import { MontagePanel } from '@features/montage/ui/MontagePanel'
import { useMontageStore } from '@features/montage/ui/montageStore'
import { PlayerControls } from '@features/player/ui/PlayerControls'
import { usePlayerStore } from '@features/player/ui/playerStore'
import { VideoPlayer } from '@features/player/ui/VideoPlayer'
import { useSessionPersistence } from '@features/session/ui/useSessionPersistence'
import { SettingsDialog } from '@features/settings/ui/SettingsDialog'
import { useSettingsStore } from '@features/settings/ui/settingsStore'
import { TrimPanel } from '@features/trimming/ui/TrimPanel'
import { ShortcutsHelp } from './shortcuts/ShortcutsHelp'
import { useEditorShortcuts } from './shortcuts/useEditorShortcuts'
import { useFileDrop } from './useFileDrop'
import styles from './app.module.css'

const openDropped = (paths: string[]): void => {
  if (!paths[0]) return
  openRecording(paths[0])
  if (paths.length > 1) {
    useUiStore.getState().showToast({
      text: `Soltaste ${paths.length} videos: abrí «${baseName(paths[0])}». Para juntarlos, abrí cada uno y agregá sus cortes al montaje.`,
      tone: 'warning',
      durationMs: 7000
    })
  }
}

/** Finished export: say so where the eyes are, with the two things people do next. */
function announceExport(path: string, sizeBytes: number, fits: boolean): void {
  const ui = useUiStore.getState()
  ui.showToast({
    text: `Exportado «${baseName(path)}» · ${formatBytes(sizeBytes)}${fits ? '' : ' (supera el límite)'}`,
    tone: fits ? 'success' : 'warning',
    actions: [
      {
        label: 'Copiar para Discord',
        run: () =>
          api.system.copyFileToClipboard(path).then(
            () => void ui.showToast({ text: 'Copiado: pegalo con Ctrl+V en Discord', tone: 'success' }),
            () => void ui.showToast({ text: 'No se pudo copiar el archivo', tone: 'warning' })
          )
      },
      { label: 'Mostrar', run: () => api.system.showInFolder(path) }
    ],
    durationMs: 12_000
  })
}

/** Window and taskbar: "Clipea2 - How To Fish - 16 sep · 02:47". */
function windowTitle(sourcePath: string | null): string {
  if (!sourcePath) return 'Clipea2'
  const { title, recordedAtMs } = describeRecording(baseName(sourcePath))
  return ['Clipea2', title, recordedAtMs === null ? null : formatRecordedAt(recordedAtMs)].filter(Boolean).join(' - ')
}

function FfmpegBanner() {
  const ffmpeg = useSettingsStore((state) => state.ffmpeg)
  const installing = useSettingsStore((state) => state.ffmpegTask?.kind === 'installing')
  if (!ffmpeg || ffmpeg.found) return null
  // One click: starts the install and opens Ajustes, where the download progress shows.
  const install = (): void => {
    useUiStore.getState().openDialog('settings')
    void useSettingsStore.getState().installFfmpeg()
  }
  return (
    <div className={styles.banner} role="alert">
      <TriangleAlert size={16} />
      <span>
        No encontré <strong>ffmpeg</strong>: sin él no se puede exportar. Clipea2 lo puede instalar con un clic.
      </span>
      <Button size="sm" variant="primary" icon={<Download size={13} />} onClick={install}>
        {installing ? 'Ver progreso' : 'Instalar ffmpeg'}
      </Button>
    </div>
  )
}

/** Right column: montage or export history on top, the export panel always at the bottom. */
function Sidebar() {
  const tab = useUiStore((state) => state.sidebarTab)
  const segmentCount = useMontageStore((state) => state.segments.length)
  const exportCount = useHistoryStore((state) => state.entries.length)

  return (
    <aside className={styles.right}>
      <Tabs
        label="Panel lateral"
        value={tab}
        onChange={(next) => useUiStore.getState().setSidebarTab(next)}
        options={[
          { value: 'montage', label: 'Montaje', count: segmentCount },
          { value: 'history', label: 'Exportados', count: exportCount }
        ]}
      />
      <div className={styles.sidebarBody}>
        {tab === 'montage' ? (
          <>
            <MontagePanel />
            <AnnotationList />
          </>
        ) : (
          <HistoryPanel />
        )}
      </div>
      <ExportPanel />
    </aside>
  )
}

/** Template: library | player + timeline | montage/history + export. */
export function App() {
  const dialog = useUiStore((state) => state.dialog)
  const discordClipPath = useUiStore((state) => state.discordClipPath)
  const sourcePath = usePlayerStore((state) => state.sourcePath)

  useSessionPersistence()
  useEditorShortcuts()
  useFileDrop(openDropped)

  useEffect(() => {
    void useSettingsStore.getState().load()
    void useHistoryStore.getState().refresh()
    return api.exporter.onEvent((event) => {
      useExportStore.getState().handleEvent(event)
      if (event.type !== 'done') return
      // The finished clip moves to "Exportados"; the export panel is free for the next one.
      void useHistoryStore.getState().refresh()
      useUiStore.getState().showExport(event.recordId)
      announceExport(event.path, event.sizeBytes, event.fits)
    })
  }, [])

  useEffect(() => {
    document.title = windowTitle(sourcePath)
  }, [sourcePath])

  const closeDialog = (): void => useUiStore.getState().closeDialog()

  return (
    <div className={styles.app}>
      <FfmpegBanner />
      <main className={styles.workspace}>
        <aside className={styles.left}>
          <LibraryPanel />
        </aside>
        <section className={styles.center}>
          <VideoPlayer />
          <PlayerControls />
          <TrimPanel />
        </section>
        <Sidebar />
      </main>
      {dialog === 'help' ? <ShortcutsHelp onClose={closeDialog} /> : null}
      {dialog === 'settings' ? <SettingsDialog onClose={closeDialog} /> : null}
      {dialog === 'discord' && discordClipPath ? <SendToChannelDialog clipPath={discordClipPath} onClose={closeDialog} /> : null}
      <Toasts />
      <InstantTooltip />
    </div>
  )
}
