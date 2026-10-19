import { FolderOpen } from 'lucide-react'
import { Button, Select } from '@shared/ui/atoms'
import { Field, SegmentedControl } from '@shared/ui/molecules'
import type { AppSettings } from '@features/settings/domain/settings'
import type { EncoderSupport } from '../domain/encoderSupport'
import { canEncode, gpuFor } from '../domain/encoderSupport'
import type { QualityLevel, VideoCodec } from '../domain/encodingPlan'
import styles from './export.module.css'

const CODECS: Array<{ value: VideoCodec; label: string; title: string }> = [
  { value: 'hevc', label: 'H.265', title: 'Recomendado: la mejor calidad por MB' },
  { value: 'h264', label: 'H.264', title: 'Máxima compatibilidad: se ve en cualquier navegador o celular' },
  { value: 'av1', label: 'AV1', title: 'Rinde como H.265 en tus clips; algunos celulares viejos no lo reproducen' }
]

const QUALITIES: Array<{ value: QualityLevel; label: string; title: string }> = [
  { value: 'max', label: 'Máxima', title: 'Más bitrate en clips cortos' },
  { value: 'high', label: 'Alta', title: 'Equilibrio entre calidad y peso' },
  { value: 'light', label: 'Liviana', title: 'Archivos más chicos' }
]

const RESOLUTIONS = [
  { value: 'source', label: 'Original' },
  { value: '1080', label: 'Hasta 1080p' },
  { value: '720', label: 'Hasta 720p' },
  { value: '540', label: 'Hasta 540p' },
  { value: '480', label: 'Hasta 480p' }
] as const

const FRAME_RATES = [
  { value: 'source', label: 'Original' },
  { value: '60', label: 'Hasta 60 fps' },
  { value: '30', label: 'Hasta 30 fps' }
] as const

const LIMITS = [
  { value: '20', label: 'Discord gratis · 20 MB' },
  { value: '50', label: 'Nitro Basic · 50 MB' },
  { value: '10', label: '10 MB (límite viejo)' },
  { value: 'none', label: 'Sin límite (solo calidad)' }
] as const

type LimitOption = { value: string; label: string }

interface ExportOptionsProps {
  settings: AppSettings
  encoders: EncoderSupport | null
  onChange: (patch: Partial<AppSettings>) => void
  onChooseFolder: () => void
}

export function ExportOptions({ settings, encoders, onChange, onChooseFolder }: ExportOptionsProps) {
  const limitValue = settings.sizeLimitMb === null ? 'none' : String(settings.sizeLimitMb)
  // A limit set by hand in settings.json still shows what is really used.
  const limits: readonly LimitOption[] = LIMITS.some((option) => option.value === limitValue)
    ? LIMITS
    : [...LIMITS, { value: limitValue, label: `${limitValue} MB (personalizado)` }]

  return (
    <div className={styles.options}>
      <Field label="Códec">
        <SegmentedControl
          label="Códec de video"
          value={settings.codec}
          onChange={(codec) => onChange({ codec })}
          options={CODECS.map((option) => ({
            value: option.value,
            label: option.label,
            disabled: encoders ? !canEncode(encoders, option.value, settings.hardwareAcceleration) : false,
            title:
              encoders && !gpuFor(encoders, option.value, settings.hardwareAcceleration) ? `${option.title} (sin GPU: más lento)` : option.title
          }))}
        />
      </Field>
      <Field label="Calidad">
        <SegmentedControl label="Calidad" value={settings.quality} onChange={(quality) => onChange({ quality })} options={QUALITIES} />
      </Field>
      <div className={styles.optionRow}>
        <Field label="Resolución">
          <Select
            aria-label="Resolución máxima"
            value={settings.maxHeight === null ? 'source' : (String(settings.maxHeight) as (typeof RESOLUTIONS)[number]['value'])}
            options={RESOLUTIONS}
            onChange={(value) => onChange({ maxHeight: value === 'source' ? null : Number(value) })}
          />
        </Field>
        <Field label="Cuadros">
          <Select
            aria-label="Cuadros por segundo máximos"
            value={settings.maxFps === null ? 'source' : (String(settings.maxFps) as (typeof FRAME_RATES)[number]['value'])}
            options={FRAME_RATES}
            onChange={(value) => onChange({ maxFps: value === 'source' ? null : Number(value) })}
          />
        </Field>
      </div>
      <Field label="Límite de tamaño">
        <Select
          aria-label="Límite de tamaño"
          value={limitValue}
          options={limits}
          onChange={(value) => onChange({ sizeLimitMb: value === 'none' ? null : Number(value) })}
        />
      </Field>
      <Field label="Carpeta de salida">
        <div className={styles.folderRow}>
          <span className={styles.folderPath} title={settings.outputDir}>
            {settings.outputDir}
          </span>
          <Button size="sm" icon={<FolderOpen size={13} />} onClick={onChooseFolder}>
            Cambiar
          </Button>
        </div>
      </Field>
    </div>
  )
}
