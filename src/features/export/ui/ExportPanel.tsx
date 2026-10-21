import { useState } from 'react'
import { Info, SlidersHorizontal, TriangleAlert, Upload, X } from 'lucide-react'
import { formatBytes, formatDuration } from '@shared/domain/time'
import { api } from '@shared/ui/api'
import { Button, IconButton, Kbd, ProgressBar, TextInput } from '@shared/ui/atoms'
import { PanelHeader } from '@shared/ui/molecules'
import { usePlayerStore } from '@features/player/ui/playerStore'
import { useSettingsStore } from '@features/settings/ui/settingsStore'
import { useTrimStore } from '@features/trimming/ui/trimStore'
import { megabytesToBytes } from '../domain/discordLimits'
import { gpuFor } from '../domain/encoderSupport'
import { describeEncoding } from '../domain/encodingPlan'
import { ExportOptions } from './ExportOptions'
import { SizeMeter } from './SizeMeter'
import { defaultFileName } from './exportTarget'
import { useExportStore } from './exportStore'
import { cancelExport, startExport } from './startExport'
import { useExportPlan, type ExportPlanning } from './useExportPlan'
import styles from './export.module.css'

function Warnings({ planning }: { planning: ExportPlanning }) {
  const { plan, preferences } = planning
  const limit = preferences.sizeLimitBytes
  const notes: Array<{ tone: 'danger' | 'warning'; text: string }> = []
  if (limit !== null && !plan.fits) {
    notes.push({
      tone: 'danger',
      text: `No entra en ${formatBytes(limit)} ni bajando la calidad. Recortá a menos de ${formatDuration(plan.maxDurationAtAll ?? 0)} o elegí «Sin límite».`
    })
  } else if (plan.reduced && limit !== null) {
    notes.push({
      tone: 'warning',
      text: `Para entrar en ${formatBytes(limit)} baja a ${plan.height}p ${Math.round(plan.fps)} fps. Con menos de ${formatDuration(plan.maxDurationAtPreferred ?? 0)} se mantiene la resolución.`
    })
  }
  if (plan.fits && plan.grade === 'baja') notes.push({ tone: 'warning', text: 'Es mucho video para ese tamaño: la calidad va a ser baja.' })
  return (
    <>
      {notes.map((note) => (
        <p key={note.text} className={styles.note} data-tone={note.tone}>
          {note.tone === 'danger' ? <TriangleAlert size={14} /> : <Info size={14} />}
          {note.text}
        </p>
      ))}
    </>
  )
}

export function ExportPanel() {
  const { target, planning } = useExportPlan()
  const settings = useSettingsStore((state) => state.settings)
  const ffmpeg = useSettingsStore((state) => state.ffmpeg)
  const job = useExportStore((state) => state.job)
  const fileName = useExportStore((state) => state.fileName)
  const [showOptions, setShowOptions] = useState(false)
  // With segments in the montage, the selection on screen is not what gets exported.
  const hasSelection = useTrimStore((state) => state.rangeSource !== null)
  const hasVideo = usePlayerStore((state) => state.sourcePath !== null)
  const selectionIgnored = target?.kind === 'montage' && hasSelection && hasVideo
  const busy = job.status === 'preparing' || job.status === 'running'
  const limit = settings?.sizeLimitMb != null ? megabytesToBytes(settings.sizeLimitMb) : null

  // Length (and cuts) of what gets exported, then the limit: all in the header, one line less below.
  const length = !target
    ? null
    : target.kind === 'montage'
      ? `${formatDuration(planning?.durationSec ?? 0)} · ${target.segments.length} ${target.segments.length === 1 ? 'corte' : 'cortes'}`
      : formatDuration(planning?.durationSec ?? target.segments[0].end - target.segments[0].start)
  const meta = [length, limit === null ? 'sin límite' : `Discord · ${formatBytes(limit)}`].filter(Boolean).join(' · ')

  return (
    <section className={styles.panel} aria-label="Exportar">
      <PanelHeader
        title="Exportar"
        meta={meta}
        actions={
          <IconButton label="Opciones de exportación" active={showOptions} onClick={() => setShowOptions(!showOptions)}>
            <SlidersHorizontal size={15} />
          </IconButton>
        }
      />
      <div className={styles.body}>
        {!target ? <p className={styles.target}>Abrí un video y marcá qué parte querés.</p> : null}
        {selectionIgnored ? (
          <p className={styles.muted}>Se exporta el montaje, no la selección. Para exportar solo la selección, vaciá el montaje.</p>
        ) : null}

        {planning ? (
          <>
            <p className={styles.specs}>
              {describeEncoding(
                { ...planning.plan, kbps: planning.plan.videoKbps },
                ffmpeg?.encoders && settings ? gpuFor(ffmpeg.encoders, planning.plan.codec, settings.hardwareAcceleration) !== null : null
              )}
            </p>
            <SizeMeter plan={planning.plan} />
            <Warnings planning={planning} />
          </>
        ) : null}

        {showOptions && settings ? (
          <ExportOptions
            settings={settings}
            encoders={ffmpeg?.encoders ?? null}
            onChange={(patch) => void useSettingsStore.getState().update(patch)}
            onChooseFolder={async () => {
              const folder = await api.system.chooseFolder(settings.outputDir)
              if (folder) await useSettingsStore.getState().update({ outputDir: folder })
            }}
          />
        ) : null}

        <TextInput
          aria-label="Nombre del archivo"
          title="Nombre del archivo (sin .mp4)"
          placeholder={target ? defaultFileName(target) : 'Nombre del clip'}
          value={fileName}
          disabled={busy}
          onChange={(event) => useExportStore.getState().setFileName(event.target.value)}
        />

        {job.status === 'running' || job.status === 'preparing' ? (
          <div className={styles.progress}>
            <div className={styles.progressHead}>
              <span className={styles.progressLabel}>
                <span className={styles.progressName} title={job.label}>
                  {job.label}
                </span>
                {job.status === 'preparing'
                  ? 'Preparando…'
                  : `${Math.round(job.fraction * 100)}%${job.speed ? ` · ${job.speed.toFixed(1).replace('.', ',')}x` : ''}`}
              </span>
              <Button size="sm" variant="ghost" icon={<X size={13} />} disabled={job.status !== 'running'} onClick={cancelExport}>
                Cancelar
              </Button>
            </div>
            <ProgressBar value={job.status === 'running' ? job.fraction : 0} label="Progreso de la exportación" />
            {job.status === 'running' && job.note ? <p className={styles.note} data-tone="warning">{job.note}</p> : null}
          </div>
        ) : (
          <Button
            variant="primary"
            size="lg"
            block
            icon={<Upload size={17} />}
            disabled={!target || !planning || (limit !== null && !planning.plan.fits) || !ffmpeg?.found}
            onClick={() => void startExport()}
          >
            Exportar a disco <Kbd>Ctrl+E</Kbd>
          </Button>
        )}

        {job.status === 'error' ? (
          <p className={styles.note} data-tone="danger" role="alert">
            <TriangleAlert size={14} /> {job.message}
          </p>
        ) : null}
        {job.status === 'cancelled' ? <p className={styles.muted}>Exportación cancelada.</p> : null}
      </div>
    </section>
  )
}
