import { Activity, useEffect, type ReactNode } from 'react'
import { Clapperboard, Download, History, LibraryBig, TriangleAlert, Upload } from 'lucide-react'
import { formatBytes } from '@shared/domain/time'
import { api } from '@shared/ui/api'
import { Button, IconButton } from '@shared/ui/atoms'
import { cx } from '@shared/ui/cx'
import { Tabs } from '@shared/ui/molecules'
import { InstantTooltip } from '@shared/ui/organisms/InstantTooltip'
import { Toasts } from '@shared/ui/organisms/Toasts'
import { useUiStore, type SidebarTab } from '@shared/ui/uiStore'
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

/** Below these widths the library, then the right column, fold into rails (same as global.css). */
const FOLDED_LIBRARY = '(max-width: 1119px)'
const FOLDED_SIDEBAR = '(max-width: 879px)'

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
      <Button size="sm" variant="primary" icon={<Download size={14} />} onClick={install}>
        {installing ? 'Ver progreso' : 'Instalar ffmpeg'}
      </Button>
    </div>
  )
}

/** A rail button with its panel's count on the corner. */
function RailButton({ label, count, active, onClick, children }: { label: string; count: number; active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <IconButton label={label} active={active} className={styles.railButton} onClick={onClick}>
      {children}
      {count ? <span className={styles.railCount}>{count}</span> : null}
    </IconButton>
  )
}

/** Left column. Folded on narrow windows: its rail button shows the library over the video. */
function LibraryColumn() {
  const open = useUiStore((state) => state.drawer === 'library')
  return (
    <aside className={styles.left} data-open={open || undefined}>
      <nav className={styles.rail} aria-label="Columna de la biblioteca">
        <IconButton label="Biblioteca" active={open} onClick={() => useUiStore.getState().toggleDrawer('library')}>
          <LibraryBig size={16} />
        </IconButton>
      </nav>
      <div className={styles.drawer}>
        <LibraryPanel />
      </div>
    </aside>
  )
}

/**
 * Right column: montage or export history on top, the export panel always at the bottom. Folded on
 * narrow windows, its rail keeps that order: the tabs on top, Exportar at the bottom.
 */
function Sidebar() {
  const tab = useUiStore((state) => state.sidebarTab)
  const open = useUiStore((state) => state.drawer === 'sidebar')
  const segmentCount = useMontageStore((state) => state.segments.length)
  const exportCount = useHistoryStore((state) => state.entries.length)
  const exporting = useExportStore((state) => state.job.status === 'running' || state.job.status === 'preparing')
  // The open tab's button closes the drawer; the other one switches to its tab.
  const showTab = (next: SidebarTab): void => {
    const ui = useUiStore.getState()
    if (open && tab === next) return ui.closeDrawer()
    ui.setSidebarTab(next)
    if (!open) ui.toggleDrawer('sidebar')
  }

  return (
    <aside className={styles.right} data-open={open || undefined}>
      <nav className={styles.rail} aria-label="Columna de montaje y exportación">
        <RailButton label="Montaje" count={segmentCount} active={open && tab === 'montage'} onClick={() => showTab('montage')}>
          <Clapperboard size={16} />
        </RailButton>
        <RailButton label="Exportados" count={exportCount} active={open && tab === 'history'} onClick={() => showTab('history')}>
          <History size={16} />
        </RailButton>
        <IconButton
          label={exporting ? 'Exportar · exportando' : 'Exportar (Ctrl+E)'}
          className={cx(styles.railButton, styles.railEnd)}
          onClick={() => useUiStore.getState().toggleDrawer('sidebar')}
        >
          <Upload size={16} />
          {exporting ? <span className={styles.railDot} /> : null}
        </IconButton>
      </nav>
      <div className={styles.drawer}>
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
          {/* Both stay mounted and the other one is only hidden: switching tabs doesn't build a panel again. */}
          <Activity mode={tab === 'montage' ? 'visible' : 'hidden'}>
            <MontagePanel />
            <AnnotationList />
          </Activity>
          <Activity mode={tab === 'history' ? 'visible' : 'hidden'}>
            <HistoryPanel />
          </Activity>
        </div>
        <ExportPanel />
      </div>
    </aside>
  )
}

/** Dims the video behind an open drawer (only where the column is folded); a click closes it. */
function DrawerScrim() {
  const drawer = useUiStore((state) => state.drawer)
  if (!drawer) return null
  return <div className={styles.scrim} data-for={drawer} onClick={() => useUiStore.getState().closeDrawer()} />
}

/**
 * A drawer closes when its column unfolds or folds (resizing the window) and, for the library, when
 * the clip picked in it opens: the video is what the person wants to see then.
 */
function useDrawerAutoClose(): void {
  useEffect(() => {
    const close = (): void => useUiStore.getState().closeDrawer()
    const queries = [FOLDED_LIBRARY, FOLDED_SIDEBAR].map((query) => window.matchMedia(query))
    for (const query of queries) query.addEventListener('change', close)
    const stop = usePlayerStore.subscribe((state, previous) => {
      if (state.sourcePath !== previous.sourcePath && useUiStore.getState().drawer === 'library') close()
    })
    return () => {
      for (const query of queries) query.removeEventListener('change', close)
      stop()
    }
  }, [])
}

/** The window title follows the open recording without re-rendering the whole app. */
function useWindowTitle(): void {
  useEffect(() => {
    document.title = windowTitle(usePlayerStore.getState().sourcePath)
    return usePlayerStore.subscribe((state, previous) => {
      if (state.sourcePath !== previous.sourcePath) document.title = windowTitle(state.sourcePath)
    })
  }, [])
}

/** Opening or closing a dialog only touches the dialogs, not the panels behind them. */
function Dialogs() {
  const dialog = useUiStore((state) => state.dialog)
  const discordClipPath = useUiStore((state) => state.discordClipPath)
  const closeDialog = (): void => useUiStore.getState().closeDialog()
  return (
    <>
      {dialog === 'help' ? <ShortcutsHelp onClose={closeDialog} /> : null}
      {dialog === 'settings' ? <SettingsDialog onClose={closeDialog} /> : null}
      {dialog === 'discord' && discordClipPath ? <SendToChannelDialog clipPath={discordClipPath} onClose={closeDialog} /> : null}
    </>
  )
}

/** Template: library | player + timeline | montage/history + export. */
export function App() {
  useSessionPersistence()
  useEditorShortcuts()
  useFileDrop(openDropped)
  useWindowTitle()
  useDrawerAutoClose()

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

  return (
    <div className={styles.app}>
      <FfmpegBanner />
      <main className={styles.workspace}>
        <LibraryColumn />
        <section className={styles.center}>
          <VideoPlayer />
          <PlayerControls />
          <TrimPanel />
        </section>
        <Sidebar />
        <DrawerScrim />
      </main>
      <Dialogs />
      <Toasts />
      <InstantTooltip />
    </div>
  )
}
