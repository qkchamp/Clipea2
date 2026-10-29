import { useEffect, useState } from 'react'
import { FolderOpen, History, RefreshCw, Trash } from 'lucide-react'
import { api } from '@shared/ui/api'
import { useInView } from '@shared/ui/useInView'
import { useUiStore } from '@shared/ui/uiStore'
import { Button, IconButton } from '@shared/ui/atoms'
import { EmptyState, PanelHeader } from '@shared/ui/molecules'
import { ConfirmDialog } from '@shared/ui/organisms/ConfirmDialog'
import { formatBytes } from '@shared/domain/time'
import { megabytesToBytes } from '@features/export/domain/discordLimits'
import { useExportStore } from '@features/export/ui/exportStore'
import { reexport } from '@features/export/ui/startExport'
import { openRecording } from '@features/library/ui/LibraryPanel'
import { useThumbnail } from '@features/media/ui/useThumbnail'
import { useMontageStore } from '@features/montage/ui/montageStore'
import { useSettingsStore } from '@features/settings/ui/settingsStore'
import { recordTitle, totalSize, type HistoryEntry } from '../domain/exportRecord'
import { HistoryItem } from './HistoryItem'
import { editInMontage } from './historyActions'
import { useHistoryStore } from './historyStore'
import styles from './history.module.css'

type ItemProps = Omit<Parameters<typeof HistoryItem>[0], 'thumbnail' | 'ref'>

/** Every card closed (null means "open the new or the latest one"). */
const ALL_COLLAPSED = ''

/** A card action waiting for a yes. */
type Pending = { action: 'reexport' | 'edit'; entry: HistoryEntry }

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
  const montageSegments = useMontageStore((state) => state.segments.length)
  const outputDir = useSettingsStore((state) => state.settings?.outputDir)
  const sizeLimitMb = useSettingsStore((state) => state.settings?.sizeLimitMb)
  const [expandedId, setExpandedId] = useState<string | null>(highlighted)
  const [confirmClear, setConfirmClear] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)

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
  const handlers = (entry: HistoryEntry): Omit<ItemProps, 'entry' | 'sizeLimitBytes' | 'expanded' | 'isNew' | 'exportBusy'> => ({
    onToggle: () => setExpandedId(openId === entry.id ? ALL_COLLAPSED : entry.id),
    onCopy: () => api.system.copyFileToClipboard(entry.path),
    onSendToChannel: () => useUiStore.getState().openDiscordSend(entry.path),
    onShowInFolder: () => void api.system.showInFolder(entry.path),
    onWatch: () => openRecording(entry.path),
    onReexport: () => setPending({ action: 'reexport', entry }),
    onEdit: () => (montageSegments > 0 ? setPending({ action: 'edit', entry }) : editInMontage(entry)),
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
                icon={<Trash size={14} />}
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
            <IconButton small label="Abrir la carpeta de exportación" disabled={!outputDir} onClick={() => outputDir && void api.system.openPath(outputDir)}>
              <FolderOpen size={16} />
            </IconButton>
            <IconButton small label="Actualizar (revisa si los archivos siguen ahí)" onClick={() => void useHistoryStore.getState().refresh()}>
              <RefreshCw size={16} />
            </IconButton>
          </>
        }
      />
      {loaded && entries.length === 0 ? (
        <EmptyState icon={<History size={18} />} title="Todavía no exportaste nada">
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
              {...handlers(entry)}
            />
          ))}
        </ol>
      )}
      {pending?.action === 'reexport' ? (
        <ConfirmDialog
          title="¿Reexportar este clip?"
          confirmLabel="Sí, reexportar"
          onConfirm={() => void reexport(pending.entry)}
          onClose={() => setPending(null)}
        >
          Se exporta de nuevo «{recordTitle(pending.entry)}» con los mismos cortes y dibujos y las opciones de exportación
          actuales. Después elegís dónde guardarlo.
        </ConfirmDialog>
      ) : null}
      {pending?.action === 'edit' ? (
        <ConfirmDialog
          title="¿Reemplazar el montaje?"
          confirmLabel="Sí, reemplazar"
          danger
          onConfirm={() => editInMontage(pending.entry)}
          onClose={() => setPending(null)}
        >
          Los cortes y dibujos de «{recordTitle(pending.entry)}» van a reemplazar {montageSegments === 1 ? 'el corte' : `los ${montageSegments} cortes`}{' '}
          que tenés ahora en el montaje.
        </ConfirmDialog>
      ) : null}
    </section>
  )
}
