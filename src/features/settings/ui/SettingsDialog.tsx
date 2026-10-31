import { useRef, useState } from 'react'
import { CircleX, FolderOpen, FolderPlus, X } from 'lucide-react'
import { LANGUAGES, type Language } from '@shared/i18n'
import { api } from '@shared/ui/api'
import { Badge, Button, IconButton } from '@shared/ui/atoms'
import { Field, SegmentedControl, Tabs } from '@shared/ui/molecules'
import { GPU_LABEL, decodingGpu } from '@features/export/domain/encoderSupport'
import { releaseNumber } from '@features/media/domain/ffmpegRelease'
import { Dialog } from '@shared/ui/organisms/Dialog'
import { useT } from '@shared/ui/useT'
import type { AppSettings } from '../domain/settings'
import { InstallCallout, InstallError, InstallProgress, UpdateAction } from './FfmpegSetup'
import { ffmpegOutdated, useSettingsStore } from './settingsStore'
import { TimelineLookPreview, type TimelineLook } from './TimelineLookPreview'
import styles from './settings.module.css'

function FolderField({ label, value, hint, onPick }: { label: string; value: string; hint?: string; onPick: () => void }) {
  const t = useT()
  return (
    <Field label={label} hint={hint}>
      <div className={styles.folder}>
        <span className={styles.path} title={value}>
          {value}
        </span>
        <Button size="sm" icon={<FolderOpen size={14} />} onClick={onPick}>
          {t.common.change}
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

/**
 * Every folder the library shows, in one box: the folders (a scrolling list past four), then a last
 * row with how many there are and "Agregar carpeta" on the right, like "Cambiar" on the export folder.
 */
function LibraryFoldersField({ roots }: { roots: string[] }) {
  const save = (libraryRoots: string[]): void => void useSettingsStore.getState().update({ libraryRoots })
  const t = useT()

  return (
    <Field label={t.settings.clipFolders} hint={t.settings.clipFoldersHint}>
      <div className={styles.folderList}>
        {roots.length > 0 ? (
          <ul className={styles.folderRows}>
            {roots.map((root) => {
              const { name, parent } = splitFolder(root)
              return (
                <li key={root} className={styles.folderRow} title={root}>
                  <span className={styles.folderName}>{name}</span>
                  <span className={styles.path}>{parent}</span>
                  <IconButton small label={t.settings.removeFolder} onClick={() => save(roots.filter((other) => other !== root))}>
                    <X size={14} />
                  </IconButton>
                </li>
              )
            })}
          </ul>
        ) : null}
        <div className={styles.folderFoot}>
          <span className={styles.folderCount}>{t.settings.folders(roots.length)}</span>
          <Button size="sm" icon={<FolderPlus size={14} />} onClick={() => void useSettingsStore.getState().addLibraryRoot()}>
            {t.settings.addFolder}
          </Button>
        </div>
      </div>
    </Field>
  )
}

/** Ajustes › General › Idioma: the whole app switches at once, the open video and the edit stay as they are. */
function LanguageField({ language }: { language: Language }) {
  const t = useT()
  return (
    <Field label={t.settings.language}>
      <SegmentedControl<Language>
        label={t.settings.language}
        value={language}
        onChange={(next) => void useSettingsStore.getState().update({ language: next })}
        options={LANGUAGES.map((value) => ({ value, label: LANGUAGE_NAMES[value].short, title: LANGUAGE_NAMES[value].name }))}
      />
    </Field>
  )
}

/** Each language by its own name, the same whichever one is in use. */
const LANGUAGE_NAMES: Record<Language, { short: string; name: string }> = {
  es: { short: 'ESP', name: 'Español' },
  en: { short: 'ENG', name: 'English' }
}

/** Ajustes › Rendimiento › Aceleración por GPU: on by default; off keeps every encode and decode on the CPU. */
function GpuField({ enabled }: { enabled: boolean }) {
  const encoders = useSettingsStore((state) => state.ffmpeg?.encoders ?? null)
  const t = useT()
  const gpu = encoders ? decodingGpu(encoders, true) : null
  const hint = !encoders ? t.settings.gpuChecking : gpu ? t.settings.gpuFound(GPU_LABEL[gpu]) : t.settings.gpuMissing
  return (
    <Field label={t.settings.gpu} hint={hint}>
      <SegmentedControl
        label={t.settings.gpu}
        value={enabled ? 'on' : 'off'}
        onChange={(value) => void useSettingsStore.getState().update({ hardwareAcceleration: value === 'on' })}
        options={[
          { value: 'on', label: t.common.on, disabled: encoders !== null && gpu === null },
          { value: 'off', label: t.common.off }
        ]}
      />
    </Field>
  )
}

/** Ajustes › Línea de tiempo: off by default; on brings back the orange tabs for the in and out points. */
function ClassicTimelineField({ enabled }: { enabled: boolean }) {
  const control = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState<TimelineLook | null>(null)
  const t = useT()
  return (
    <Field label={t.settings.classicTimeline} hint={t.settings.classicTimelineHint}>
      <div ref={control} className={styles.lookControl}>
        <SegmentedControl
          label={t.settings.classicTimeline}
          value={enabled ? 'on' : 'off'}
          onChange={(value) => void useSettingsStore.getState().update({ classicTimeline: value === 'on' })}
          onHoverChange={setHovered}
          options={[
            { value: 'on', label: t.common.on },
            { value: 'off', label: t.common.off }
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
  const t = useT()
  if (!settings) return null

  const pickFolder = async (key: keyof Pick<AppSettings, 'outputDir' | 'ffmpegDir'>): Promise<void> => {
    const folder = await api.system.chooseFolder(settings[key] ?? undefined)
    if (folder) await useSettingsStore.getState().update({ [key]: folder })
  }

  return (
    <Dialog title={t.settings.title} onClose={onClose}>
      <div className={styles.body}>
        <Tabs
          label={t.settings.sections}
          variant="segmented"
          className={styles.tabs}
          value={section}
          onChange={setSection}
          options={[
            { value: 'general', label: t.settings.tabs.general },
            { value: 'timeline', label: t.settings.tabs.timeline },
            { value: 'performance', label: t.settings.tabs.performance }
          ]}
        />

        {/* The sections share one cell, so the dialog keeps the tallest one's height and the tabs never move. */}
        <div className={styles.sections}>
          <div className={styles.section} inert={section !== 'general'}>
            <LanguageField language={settings.language} />
            <LibraryFoldersField roots={settings.libraryRoots} />
            <FolderField label={t.settings.exportFolder} value={settings.outputDir} onPick={() => void pickFolder('outputDir')} />

            <Field label="ffmpeg">
              <div className={styles.ffmpeg}>
                {ffmpeg?.found ? (
                  <>
                    <p className={styles.ok}>
                      ffmpeg {ffmpeg.version}
                      {outdated && latest ? <Badge tone="warning">{t.settings.oldVersion(releaseNumber(latest)?.join('.') ?? latest)}</Badge> : null}
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
                                {row.label} · {gpu ? GPU_LABEL[gpu] : support.cpu[row.codec] ? 'CPU' : t.settings.unavailable}
                              </Badge>
                            )
                          })
                        : <Badge>{t.settings.checkingGpu}</Badge>}
                    </div>
                  </>
                ) : (
                  <p className={styles.bad}>
                    <CircleX size={14} /> {t.settings.ffmpegNotFound}
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
                    {t.settings.pickFfmpeg}
                  </Button>
                  {settings.ffmpegDir ? (
                    <IconButton small label={t.settings.autoFfmpeg} onClick={() => void useSettingsStore.getState().update({ ffmpegDir: null })}>
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
              {t.settings.discordNote[0]}
              <strong>{t.settings.discordNote[1]}</strong>
              {t.settings.discordNote[2]}
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
