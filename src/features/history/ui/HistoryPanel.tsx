import { useEffect, useState } from 'react'
import { FolderOpen, History, RefreshCw, Trash } from 'lucide-react'
import { api } from '@shared/ui/api'
import { useInView } from '@shared/ui/useInView'
import { useUiStore } from '@shared/ui/uiStore'
import { Button, IconButton } from '@shared/ui/atoms'
import { EmptyState, PanelHeader } from '@shared/ui/molecules'
import { formatBytes } from '@shared/domain/time'
import { megabytesToBytes } from '@features/export/domain/discordLimits'
import { useExportStore } from '@features/export/ui/exportStore'
import { reexport } from '@features/export/ui/startExport'
import { openRecording } from '@features/library/ui/LibraryPanel'
import { useThumbnail } from '@features/media/ui/useThumbnail'
import { useMontageStore } from '@features/montage/ui/montageStore'
import { useSettingsStore } from '@features/settings/ui/settingsStore'
import { totalSize, type HistoryEntry } from '../domain/exportRecord'
import { HistoryItem } from './HistoryItem'
import { editInMontage } from './historyActions'
import { useHistoryStore } from './historyStore'
import styles from './history.module.css'

type ItemProps = Omit<Parameters<typeof HistoryItem>[0], 'thumbnail' | 'ref'>

/** Every card closed (null means "open the new or the latest one"). */
const ALL_COLLAPSED = ''

function LazyHistoryItem(props: ItemProps) {
  const [ref, visible] = useInView<HTMLLIElement>()
  const thumbnail = useThumbnail(props.entry.path, undefined, visible && props.entry.fileExists)
  return <HistoryItem {...props} ref={ref} thumbnail={thumbnail} />
}

/** Finished exports: copy them to Discord again, watch them, or export them again. */
export function HistoryPanel() {
  const entries = useHistoryStore((state) => state.entries)
  const loaded = useHistoryStore((state) => state.loaded)
  const highlighted = useUiStore((state) => state.highlightedExportId)
  const exportBusy = useExportStore((state) => state.job.status === 'running' || state.job.status === 'preparing')
  const montageHasSegments = useMontageStore((state) => state.segments.length > 0)
  const outputDir = useSettingsStore((state) => state.settings?.outputDir)
  const sizeLimitMb = useSettingsStore((state) => state.settings?.sizeLimitMb)
  const [expandedId, setExpandedId] = useState<string | null>(highlighted)
  const [confirmClear, setConfirmClear] = useState(false)

  useEffect(() => {
    if (!confirmClear) return
    const timer = window.setTimeout(() => setConfirmClear(false), 3000)
    return () => window.clearTimeout(timer)
  }, [confirmClear])

  useEffect(() => {
    void useHistoryStore.getState().refresh()
  }, [])

  useEffect(() => {
    if (highlighted) setExpandedId(highlighted)
  }, [highlighted])

  const openId = expandedId ?? entries[0]?.id ?? null
  const limitFor = (entry: HistoryEntry): number | null =>
    sizeLimitMb === undefined ? entry.sizeLimitBytes : sizeLimitMb === null ? null : megabytesToBytes(sizeLimitMb)
  const handlers = (
    entry: HistoryEntry
  ): Omit<ItemProps, 'entry' | 'sizeLimitBytes' | 'expanded' | 'isNew' | 'exportBusy' | 'montageHasSegments'> => ({
    onToggle: () => setExpandedId(openId === entry.id ? ALL_COLLAPSED : entry.id),
    onCopy: () => api.system.copyFileToClipboard(entry.path),
    onSendToChannel: () => useUiStore.getState().openDiscordSend(entry.path),
    onShowInFolder: () => void api.system.showInFolder(entry.path),
    onWatch: () => openRecording(entry.path),
    onReexport: () => void reexport(entry),
    onEdit: () => editInMontage(entry),
    onRemove: () => void useHistoryStore.getState().remove(entry.id)
  })

  return (
    <section className={styles.panel} aria-label="Exportados">
      <PanelHeader
        meta={entries.length > 0 ? `${entries.length} ${entries.length === 1 ? 'clip' : 'clips'} · ${formatBytes(totalSize(entries))}` : undefined}
        actions={
          <>
            {entries.length > 0 ? (
              <Button
                size="sm"
                variant={confirmClear ? 'danger' : 'ghost'}
                icon={<Trash size={13} />}
                title="Vaciar la lista de exportados (los archivos no se borran)"
                onClick={() => {
                  if (!confirmClear) return setConfirmClear(true)
                  setConfirmClear(false)
                  setExpandedId(null)
                  void useHistoryStore.getState().clear()
                }}
              >
                {confirmClear ? '¿Vaciar?' : 'Vaciar'}
              </Button>
            ) : null}
            <IconButton label="Abrir la carpeta de exportación" disabled={!outputDir} onClick={() => outputDir && void api.system.openPath(outputDir)}>
              <FolderOpen size={15} />
            </IconButton>
            <IconButton label="Actualizar (revisa si los archivos siguen ahí)" onClick={() => void useHistoryStore.getState().refresh()}>
              <RefreshCw size={14} />
            </IconButton>
          </>
        }
      />
      {loaded && entries.length === 0 ? (
        <EmptyState icon={<History size={20} />} title="Todavía no exportaste nada">
          Cada exportación queda acá para copiarla a Discord, verla o volver a exportarla con otras opciones.
        </EmptyState>
      ) : (
        <ol className={styles.list}>
          {entries.map((entry) => (
            <LazyHistoryItem
              key={entry.id}
              entry={entry}
              sizeLimitBytes={limitFor(entry)}
              expanded={openId === entry.id}
              isNew={highlighted === entry.id}
              exportBusy={exportBusy}
              montageHasSegments={montageHasSegments}
              {...handlers(entry)}
            />
          ))}
        </ol>
      )}
    </section>
  )
}
