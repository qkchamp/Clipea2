import { useRef, useState } from 'react'
import { CircleX, FolderOpen, FolderPlus, X } from 'lucide-react'
import { api } from '@shared/ui/api'
import { Badge, Button, IconButton } from '@shared/ui/atoms'
import { Field, SegmentedControl, Tabs } from '@shared/ui/molecules'
import { GPU_LABEL, decodingGpu } from '@features/export/domain/encoderSupport'
import { releaseNumber } from '@features/media/domain/ffmpegRelease'
import { Dialog } from '@shared/ui/organisms/Dialog'
import type { AppSettings } from '../domain/settings'
import { InstallCallout, InstallError, InstallProgress, UpdateAction } from './FfmpegSetup'
import { ffmpegOutdated, useSettingsStore } from './settingsStore'
import { TimelineLookPreview, type TimelineLook } from './TimelineLookPreview'
import styles from './settings.module.css'

function FolderField({ label, value, hint, onPick }: { label: string; value: string; hint?: string; onPick: () => void }) {
  return (
    <Field label={label} hint={hint}>
      <div className={styles.folder}>
        <span className={styles.path} title={value}>
          {value}
        </span>
        <Button size="sm" icon={<FolderOpen size={14} />} onClick={onPick}>
          Cambiar
        </Button>
      </div>
    </Field>
  )
}

/** "D:\Clips\Valorant" → "Valorant" in "D:\Clips": folders under one parent tell apart by their name. A drive root stays whole. */
function splitFolder(path: string): { name: string; parent: string } {
  const at = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
  if (at <= 0 || at === path.length - 1) return { name: path, parent: '' }
  return { name: path.slice(at + 1), parent: path.slice(0, at) }
}

const describeFolders = (count: number): string =>
  count === 0 ? 'Ninguna carpeta todavía' : `${count} ${count === 1 ? 'carpeta' : 'carpetas'}`

/**
 * Every folder the library shows, in one box: the folders (a scrolling list past four), then a last
 * row with how many there are and "Agregar carpeta" on the right, like "Cambiar" on the export folder.
 */
function LibraryFoldersField({ roots }: { roots: string[] }) {
  const save = (libraryRoots: string[]): void => void useSettingsStore.getState().update({ libraryRoots })

  return (
    <Field
      label="Carpetas de clips"
      hint="Donde se guardan tus grabaciones, del programa que sea. La biblioteca las muestra juntas, y cada subcarpeta (un juego, por ejemplo) como un grupo."
    >
      <div className={styles.folderList}>
        {roots.length > 0 ? (
          <ul className={styles.folderRows}>
            {roots.map((root) => {
              const { name, parent } = splitFolder(root)
              return (
                <li key={root} className={styles.folderRow} title={root}>
                  <span className={styles.folderName}>{name}</span>
                  <span className={styles.path}>{parent}</span>
                  <IconButton small label="Quitar de la biblioteca (los videos no se borran)" onClick={() => save(roots.filter((other) => other !== root))}>
                    <X size={14} />
                  </IconButton>
                </li>
              )
            })}
          </ul>
        ) : null}
        <div className={styles.folderFoot}>
          <span className={styles.folderCount}>{describeFolders(roots.length)}</span>
          <Button size="sm" icon={<FolderPlus size={14} />} onClick={() => void useSettingsStore.getState().addLibraryRoot()}>
            Agregar carpeta
          </Button>
        </div>
      </div>
    </Field>
  )
}

/** Ajustes › Performance › Aceleración por GPU: on by default; off keeps every encode and decode on the CPU. */
function GpuField({ enabled }: { enabled: boolean }) {
  const encoders = useSettingsStore((state) => state.ffmpeg?.encoders ?? null)
  const gpu = encoders ? decodingGpu(encoders, true) : null
  const hint = !encoders
    ? 'Buscando la GPU…'
    : gpu
      ? `${GPU_LABEL[gpu]}: exporta varias veces más rápido. Desactivala solo si una exportación falla o se ve rara.`
      : 'No encontré una GPU compatible (NVIDIA, AMD o Intel): se usa la CPU.'
  return (
    <Field label="Aceleración por GPU" hint={hint}>
      <SegmentedControl
        label="Aceleración por GPU"
        value={enabled ? 'on' : 'off'}
        onChange={(value) => void useSettingsStore.getState().update({ hardwareAcceleration: value === 'on' })}
        options={[
          { value: 'on', label: 'Activada', disabled: encoders !== null && gpu === null },
          { value: 'off', label: 'Desactivada' }
        ]}
      />
    </Field>
  )
}

/** Ajustes › Timeline: off by default; on brings back the orange tabs for the in and out points. */
function ClassicTimelineField({ enabled }: { enabled: boolean }) {
  const control = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState<TimelineLook | null>(null)
  return (
    <Field label="Timeline anterior" hint="Muestra el inicio y el fin del recorte con las pestañas naranjas de antes, en vez de las líneas verde y roja.">
      <div ref={control} className={styles.lookControl}>
        <SegmentedControl
          label="Timeline anterior"
          value={enabled ? 'on' : 'off'}
          onChange={(value) => void useSettingsStore.getState().update({ classicTimeline: value === 'on' })}
          onHoverChange={setHovered}
          options={[
            { value: 'on', label: 'Activada' },
            { value: 'off', label: 'Desactivada' }
          ]}
        />
      </div>
      {hovered ? <TimelineLookPreview anchor={control} current={enabled ? 'on' : 'off'} hovered={hovered} /> : null}
    </Field>
  )
}

type Section = 'general' | 'timeline' | 'performance'

const ENCODER_ROWS = [
  { codec: 'hevc', label: 'H.265' },
  { codec: 'h264', label: 'H.264' },
  { codec: 'av1', label: 'AV1' }
] as const

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const settings = useSettingsStore((state) => state.settings)
  const ffmpeg = useSettingsStore((state) => state.ffmpeg)
  const ffmpegTask = useSettingsStore((state) => state.ffmpegTask)
  const latest = useSettingsStore((state) => state.ffmpegLatest)
  const outdated = useSettingsStore(ffmpegOutdated)
  const [section, setSection] = useState<Section>('general')
  if (!settings) return null

  const pickFolder = async (key: keyof Pick<AppSettings, 'outputDir' | 'ffmpegDir'>): Promise<void> => {
    const folder = await api.system.chooseFolder(settings[key] ?? undefined)
    if (folder) await useSettingsStore.getState().update({ [key]: folder })
  }

  return (
    <Dialog title="Ajustes" onClose={onClose}>
      <div className={styles.body}>
        <Tabs
          label="Secciones de ajustes"
          variant="segmented"
          className={styles.tabs}
          value={section}
          onChange={setSection}
          options={[
            { value: 'general', label: 'General' },
            { value: 'timeline', label: 'Timeline' },
            { value: 'performance', label: 'Performance' }
          ]}
        />

        {/* The sections share one cell, so the dialog keeps the tallest one's height and the tabs never move. */}
        <div className={styles.sections}>
          <div className={styles.section} inert={section !== 'general'}>
            <LibraryFoldersField roots={settings.libraryRoots} />
            <FolderField label="Carpeta de exportación" value={settings.outputDir} onPick={() => void pickFolder('outputDir')} />

            <Field label="ffmpeg">
              <div className={styles.ffmpeg}>
                {ffmpeg?.found ? (
                  <>
                    <p className={styles.ok}>
                      ffmpeg {ffmpeg.version}
                      {outdated && latest ? <Badge tone="warning">Versión vieja · ya salió la {releaseNumber(latest)?.join('.')}</Badge> : null}
                    </p>
                    <p className={styles.path} title={ffmpeg.ffmpegPath ?? ''}>
                      {ffmpeg.ffmpegPath}
                    </p>
                    <div className={styles.encoders}>
                      {ffmpeg.encoders
                        ? ENCODER_ROWS.map((row) => {
                            const support = ffmpeg.encoders!
                            const gpu = support.gpu[row.codec]
                            return (
                              <Badge key={row.codec} tone={gpu ? 'success' : support.cpu[row.codec] ? 'warning' : 'danger'}>
                                {row.label} · {gpu ? GPU_LABEL[gpu] : support.cpu[row.codec] ? 'CPU' : 'no disponible'}
                              </Badge>
                            )
                          })
                        : <Badge>Revisando la GPU…</Badge>}
                    </div>
                  </>
                ) : (
                  <p className={styles.bad}>
                    <CircleX size={14} /> No encontrado: sin ffmpeg no se puede exportar.
                  </p>
                )}
                {ffmpegTask?.kind === 'installing' ? (
                  <InstallProgress progress={ffmpegTask.progress} />
                ) : ffmpeg && !ffmpeg.found ? (
                  <InstallCallout />
                ) : null}
                {ffmpegTask?.kind === 'error' ? <InstallError message={ffmpegTask.message} retry={ffmpegTask.retry} /> : null}
                <div className={styles.row}>
                  <Button size="sm" icon={<FolderOpen size={14} />} onClick={() => void pickFolder('ffmpegDir')}>
                    Elegir carpeta de ffmpeg
                  </Button>
                  {settings.ffmpegDir ? (
                    <IconButton small label="Volver a buscarlo automáticamente" onClick={() => void useSettingsStore.getState().update({ ffmpegDir: null })}>
                      <X size={14} />
                    </IconButton>
                  ) : null}
                  {ffmpeg?.found && ffmpegTask?.kind !== 'installing' ? (
                    <span className={styles.rowEnd}>
                      <UpdateAction installed={ffmpeg.version} />
                    </span>
                  ) : null}
                </div>
              </div>
            </Field>

            <p className={styles.note}>
              Límite de Discord sin Nitro: <strong>20 MB por archivo</strong> (subió de 10 MB en agosto de 2026). Clipea2
              apunta al 95% del límite y, si el archivo sale más grande, lo vuelve a codificar más liviano.
            </p>
          </div>

          <div className={styles.section} inert={section !== 'timeline'}>
            <ClassicTimelineField enabled={settings.classicTimeline} />
          </div>

          <div className={styles.section} inert={section !== 'performance'}>
            <GpuField enabled={settings.hardwareAcceleration} />
          </div>
        </div>
      </div>
    </Dialog>
  )
}
