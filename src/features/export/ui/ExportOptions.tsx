import { FolderOpen } from 'lucide-react'
import { Button, Select } from '@shared/ui/atoms'
import { Field, SegmentedControl } from '@shared/ui/molecules'
import { useT } from '@shared/ui/useT'
import type { AppSettings } from '@features/settings/domain/settings'
import type { EncoderSupport } from '../domain/encoderSupport'
import { canEncode, gpuFor } from '../domain/encoderSupport'
import type { QualityLevel, VideoCodec } from '../domain/encodingPlan'
import styles from './export.module.css'

const CODECS: Array<{ value: VideoCodec; label: string }> = [
  { value: 'hevc', label: 'H.265' },
  { value: 'h264', label: 'H.264' },
  { value: 'av1', label: 'AV1' }
]

const QUALITIES: readonly QualityLevel[] = ['max', 'high', 'light']

const RESOLUTIONS = ['source', '1080', '720', '540', '480'] as const

const FRAME_RATES = ['source', '60', '30'] as const

const LIMITS = ['20', '50', '10', 'none'] as const

type LimitOption = { value: string; label: string }

interface ExportOptionsProps {
  settings: AppSettings
  encoders: EncoderSupport | null
  onChange: (patch: Partial<AppSettings>) => void
  onChooseFolder: () => void
}

export function ExportOptions({ settings, encoders, onChange, onChooseFolder }: ExportOptionsProps) {
  const t = useT()
  const limitValue = settings.sizeLimitMb === null ? 'none' : String(settings.sizeLimitMb)
  const known: readonly LimitOption[] = LIMITS.map((value) => ({ value, label: t.export.limits[value] }))
  // A limit set by hand in settings.json still shows what is really used.
  const limits: readonly LimitOption[] = known.some((option) => option.value === limitValue)
    ? known
    : [...known, { value: limitValue, label: t.export.customLimit(limitValue) }]
  const resolutions = RESOLUTIONS.map((value) => ({ value, label: value === 'source' ? t.export.original : t.export.upTo(`${value}p`) }))
  const frameRates = FRAME_RATES.map((value) => ({ value, label: value === 'source' ? t.export.original : t.export.upTo(`${value} fps`) }))

  return (
    <div className={styles.options}>
      <Field label={t.export.codec}>
        <SegmentedControl
          label={t.export.videoCodec}
          value={settings.codec}
          onChange={(codec) => onChange({ codec })}
          options={CODECS.map((option) => ({
            value: option.value,
            label: option.label,
            disabled: encoders ? !canEncode(encoders, option.value, settings.hardwareAcceleration) : false,
            title:
              encoders && !gpuFor(encoders, option.value, settings.hardwareAcceleration)
                ? t.export.noGpu(t.export.codecTitles[option.value])
                : t.export.codecTitles[option.value]
          }))}
        />
      </Field>
      <Field label={t.export.quality}>
        <SegmentedControl
          label={t.export.quality}
          value={settings.quality}
          onChange={(quality) => onChange({ quality })}
          options={QUALITIES.map((value) => ({ value, label: t.export.qualities[value], title: t.export.qualityTitles[value] }))}
        />
      </Field>
      <div className={styles.optionRow}>
        <Field label={t.export.resolution}>
          <Select
            aria-label={t.export.maxResolution}
            value={settings.maxHeight === null ? 'source' : (String(settings.maxHeight) as (typeof RESOLUTIONS)[number])}
            options={resolutions}
            onChange={(value) => onChange({ maxHeight: value === 'source' ? null : Number(value) })}
          />
        </Field>
        <Field label={t.export.frameRate}>
          <Select
            aria-label={t.export.maxFps}
            value={settings.maxFps === null ? 'source' : (String(settings.maxFps) as (typeof FRAME_RATES)[number])}
            options={frameRates}
            onChange={(value) => onChange({ maxFps: value === 'source' ? null : Number(value) })}
          />
        </Field>
      </div>
      <Field label={t.export.sizeLimit}>
        <Select
          aria-label={t.export.sizeLimit}
          value={limitValue}
          options={limits}
          onChange={(value) => onChange({ sizeLimitMb: value === 'none' ? null : Number(value) })}
        />
      </Field>
      <Field label={t.export.outputFolder}>
        <div className={styles.folderRow}>
          <span className={styles.folderPath} title={settings.outputDir}>
            {settings.outputDir}
          </span>
          <Button size="sm" icon={<FolderOpen size={14} />} onClick={onChooseFolder}>
            {t.common.change}
          </Button>
        </div>
      </Field>
    </div>
  )
}
