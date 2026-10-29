import { CircleAlert, CircleCheck, Download, LoaderCircle, RefreshCw } from 'lucide-react'
import { isNewerRelease, releaseNumber, type FfmpegInstallProgress } from '@features/media/domain/ffmpegRelease'
import { Button, ProgressBar } from '@shared/ui/atoms'
import { useSettingsStore } from './settingsStore'
import styles from './settings.module.css'

/*
 * Ajustes › ffmpeg: one click installs it when it's missing, or updates it when a newer release is
 * out. The download progress takes the place of the button, and a failure says why.
 */

const megabytes = (bytes: number): string => `${Math.round(bytes / 1_000_000)} MB`

/** Download bar while installing; unzipping has no measurable progress, so the bar stays full. */
export function InstallProgress({ progress }: { progress: FfmpegInstallProgress | null }) {
  const downloading = progress?.stage === 'downloading' ? progress : null
  const fraction = progress?.stage === 'extracting' ? 1 : downloading?.totalBytes ? downloading.receivedBytes / downloading.totalBytes : 0
  return (
    <div className={styles.install}>
      <div className={styles.installHead}>
        <span className={styles.installTitle}>
          <LoaderCircle size={14} className={styles.spin} />
          {progress?.stage === 'extracting' ? 'Instalando…' : downloading ? 'Descargando ffmpeg…' : 'Buscando la última versión…'}
        </span>
        {downloading ? (
          <span className={styles.installSize}>
            {megabytes(downloading.receivedBytes)}
            {downloading.totalBytes ? ` / ${megabytes(downloading.totalBytes)}` : ''}
          </span>
        ) : null}
      </div>
      <ProgressBar value={fraction} label="Instalación de ffmpeg" />
    </div>
  )
}

/** Shown when there's no ffmpeg: the one action that matters in this box. */
export function InstallCallout() {
  return (
    <div className={styles.callout}>
      <span className={styles.calloutIcon}>
        <Download size={16} />
      </span>
      <div className={styles.calloutText}>
        <strong>Instalalo con un clic</strong>
        <span>Clipea2 descarga la versión oficial para Windows (unos 115 MB) y la deja lista para usar.</span>
      </div>
      <Button size="sm" variant="primary" icon={<Download size={14} />} onClick={() => void useSettingsStore.getState().installFfmpeg()}>
        Instalar
      </Button>
    </div>
  )
}

export function InstallError({ message, retry }: { message: string; retry: 'check' | 'install' }) {
  const store = useSettingsStore.getState
  return (
    <div className={styles.installError}>
      <CircleAlert size={14} />
      <span>{message}</span>
      <Button size="sm" variant="ghost" onClick={() => void (retry === 'check' ? store().checkFfmpegUpdate() : store().installFfmpeg())}>
        Reintentar
      </Button>
    </div>
  )
}

/** With ffmpeg found: look for a newer release on demand and install it with one more click. */
export function UpdateAction({ installed }: { installed: string | null }) {
  const latest = useSettingsStore((state) => state.ffmpegLatest)
  const checking = useSettingsStore((state) => state.ffmpegTask?.kind === 'checking')
  const store = useSettingsStore.getState

  if (checking) {
    return (
      <span className={styles.updateNote}>
        <LoaderCircle size={14} className={styles.spin} /> Buscando…
      </span>
    )
  }
  if (latest && isNewerRelease(latest, installed)) {
    return (
      <Button size="sm" variant="primary" icon={<Download size={14} />} onClick={() => void store().installFfmpeg()}>
        Actualizar a {releaseNumber(latest)?.join('.')}
      </Button>
    )
  }
  if (latest) {
    return (
      <span className={styles.updateNote}>
        <CircleCheck size={14} /> Es la última versión
      </span>
    )
  }
  return (
    <Button size="sm" variant="ghost" icon={<RefreshCw size={14} />} onClick={() => void store().checkFfmpegUpdate()}>
      Buscar actualización
    </Button>
  )
}
