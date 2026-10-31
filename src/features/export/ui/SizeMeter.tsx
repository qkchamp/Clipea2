import { formatBytes } from '@shared/domain/time'
import { ProgressBar } from '@shared/ui/atoms'
import type { EncodingPlan, QualityGrade } from '../domain/encodingPlan'
import styles from './export.module.css'

/** Filled steps of the quality bar, out of 4. */
const GRADE_STEPS: Record<QualityGrade, number> = { baja: 1, aceptable: 2, buena: 3, excelente: 4 }
const STEPS = [1, 2, 3, 4]

/** Color only when something needs a look: a good export stays quiet. */
const GRADE_TONE: Record<QualityGrade, 'ok' | 'warning' | 'danger'> = {
  excelente: 'ok',
  buena: 'ok',
  aceptable: 'warning',
  baja: 'danger'
}

const capitalized = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)

/**
 * The two things to know before exporting, side by side: how much the file weighs at most against
 * the Discord limit, and how good it will look. Each with its bar: the weight fills up to the limit,
 * the quality in four steps.
 */
export function SizeMeter({ plan }: { plan: EncodingPlan }) {
  const limit = plan.sizeLimitBytes
  const ratio = limit ? plan.estimatedMaxBytes / limit : 0
  const tone = !plan.fits ? 'danger' : ratio > 0.97 ? 'warning' : 'ok'
  const steps = GRADE_STEPS[plan.grade]

  return (
    <div className={styles.meter} data-tone={limit ? tone : undefined}>
      <div className={styles.stat} title="Peso máximo estimado: el archivo puede salir más liviano">
        <span className={styles.statLabel}>Peso máximo</span>
        <p className={styles.statValue}>
          <strong className="tabular">{formatBytes(Math.min(plan.estimatedMaxBytes, limit ?? Infinity))}</strong>
          <span>{limit ? `de ${formatBytes(limit)}` : 'sin límite'}</span>
        </p>
        {limit ? (
          <ProgressBar value={Math.min(1, ratio)} tone={tone === 'ok' ? 'accent' : tone} label="Peso estimado respecto del límite" />
        ) : null}
      </div>
      <div className={styles.stat} data-tone={GRADE_TONE[plan.grade]} title="Calidad estimada para esta duración">
        <span className={styles.statLabel}>Calidad</span>
        <p className={styles.statValue}>
          <strong>{capitalized(plan.grade)}</strong>
        </p>
        <div className={styles.steps} role="img" aria-label={`Calidad ${plan.grade}: ${steps} de 4`}>
          {STEPS.map((step) => (
            <span key={step} data-on={step <= steps || undefined} />
          ))}
        </div>
      </div>
    </div>
  )
}
