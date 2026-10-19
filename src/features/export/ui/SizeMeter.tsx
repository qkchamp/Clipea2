import { formatBytes } from '@shared/domain/time'
import { Badge, ProgressBar, type BadgeTone } from '@shared/ui/atoms'
import type { EncodingPlan, QualityGrade } from '../domain/encodingPlan'
import styles from './export.module.css'

const GRADE_TONE: Record<QualityGrade, BadgeTone> = {
  excelente: 'success',
  buena: 'success',
  aceptable: 'warning',
  baja: 'danger'
}

/** Estimated size against the Discord limit, plus the expected quality. */
export function SizeMeter({ plan }: { plan: EncodingPlan }) {
  const limit = plan.sizeLimitBytes
  const ratio = limit ? plan.estimatedMaxBytes / limit : 0
  const tone = !plan.fits ? 'danger' : ratio > 0.97 ? 'warning' : 'success'

  return (
    <div className={styles.meter} data-tone={limit ? tone : undefined}>
      <div className={styles.meterTop}>
        <span className={styles.meterLabel}>Peso estimado</span>
        <Badge tone={GRADE_TONE[plan.grade]} title="Calidad estimada para esta duración">
          Calidad {plan.grade}
        </Badge>
      </div>
      <p className={styles.meterValue}>
        hasta <strong className="tabular">{formatBytes(Math.min(plan.estimatedMaxBytes, limit ?? Infinity))}</strong>
        {limit ? <span className={styles.meterLimit}> de {formatBytes(limit)}</span> : null}
      </p>
      {limit ? <ProgressBar value={Math.min(1, ratio)} tone={tone} label="Peso estimado respecto del límite" /> : null}
    </div>
  )
}
