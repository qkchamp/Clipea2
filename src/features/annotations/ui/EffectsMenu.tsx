import { useEffect, useRef, useState, type RefObject } from 'react'
import { Sparkles } from 'lucide-react'
import { IconButton } from '@shared/ui/atoms'
import { Popover } from '@shared/ui/organisms/Popover'
import { annotationLabel, type Annotation } from '../domain/annotation'
import {
  DEFAULT_EFFECTS,
  MAX_RATE,
  MIN_EFFECT_SECONDS,
  MIN_RATE,
  SIDES,
  effectOf,
  hasEffects,
  type EffectKind,
  type Side
} from '../domain/effects'
import { useAnnotationStore } from './annotationStore'
import styles from './annotations.module.css'

interface EffectRow {
  kind: EffectKind
  name: string
}

/** Effects by where they act on the drawing's bar; the title of each group says it, so the rows stay short. */
const GROUPS: ReadonlyArray<{ title: string; rows: readonly EffectRow[] }> = [
  {
    title: 'Al empezar la barra del dibujo',
    rows: [
      { kind: 'fadeIn', name: 'Aparecer' },
      { kind: 'zoomIn', name: 'Zoom' },
      { kind: 'slideIn', name: 'Deslizar' }
    ]
  },
  {
    title: 'Al terminar la barra',
    rows: [
      { kind: 'fadeOut', name: 'Desvanecer' },
      { kind: 'zoomOut', name: 'Zoom' },
      { kind: 'slideOut', name: 'Deslizar' }
    ]
  },
  {
    title: 'Mientras se ve',
    rows: [
      { kind: 'blink', name: 'Parpadeo' },
      { kind: 'pulse', name: 'Latido' }
    ]
  }
]

const SIDE_NAMES: Record<Side, string> = { left: 'la izquierda', right: 'la derecha', top: 'arriba', bottom: 'abajo' }

const formatNumber = (value: number): string => String(Math.round(value * 100) / 100).replace('.', ',')

/** "0,5" and "0.5" both work; anything that is not a number is null. */
function parseNumber(text: string): number | null {
  const value = Number(text.trim().replace(',', '.'))
  return text.trim() !== '' && Number.isFinite(value) ? value : null
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

/** A small number box: commits on Enter or blur, ↑/↓ nudge it, Escape gives the old value back. */
function NumberField({
  label,
  value,
  min,
  max,
  step,
  unit,
  disabled,
  onCommit
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  disabled: boolean
  onCommit: (value: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const parsed = draft === null ? value : parseNumber(draft)

  useEffect(() => setDraft(null), [value])

  const commit = (): void => {
    if (draft === null) return
    if (parsed !== null) onCommit(clamp(parsed, min, max))
    setDraft(null)
  }

  return (
    <span className={styles.number}>
      <input
        className={styles.numberInput}
        aria-label={label}
        title={`${label} (↑ y ↓ para ajustar)`}
        inputMode="decimal"
        spellCheck={false}
        disabled={disabled}
        value={draft ?? formatNumber(value)}
        data-invalid={(draft !== null && parsed === null) || undefined}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={(event) => event.target.select()}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            commit()
            event.currentTarget.blur()
          } else if (event.key === 'Escape') {
            setDraft(null)
            event.currentTarget.blur()
          } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault()
            onCommit(clamp(Math.round((value + (event.key === 'ArrowUp' ? step : -step)) * 100) / 100, min, max))
          }
        }}
      />
      <span className={styles.numberUnit}>{unit}</span>
    </span>
  )
}

function EffectToggleRow({ drawing, row }: { drawing: Annotation; row: EffectRow }) {
  const setEffect = useAnnotationStore((state) => state.setEffect)
  const removeEffect = useAnnotationStore((state) => state.removeEffect)
  const on = effectOf(drawing, row.kind)
  // Off rows show what turning them on would give.
  const shown = on ?? DEFAULT_EFFECTS[row.kind]
  const barSeconds = drawing.end - drawing.start
  const id = `effect-${row.kind}`

  return (
    <div className={styles.effectRow} data-on={on ? '' : undefined}>
      <input
        id={id}
        type="checkbox"
        className={styles.effectCheck}
        checked={Boolean(on)}
        onChange={(event) => (event.target.checked ? setEffect(drawing.id, DEFAULT_EFFECTS[row.kind]) : removeEffect(drawing.id, row.kind))}
      />
      <label htmlFor={id} className={styles.effectName}>
        {row.name}
      </label>
      {'side' in shown ? (
        <select
          className={styles.effectSide}
          aria-label={row.kind === 'slideIn' ? 'Desde dónde entra' : 'Hacia dónde sale'}
          disabled={!on}
          value={shown.side}
          onChange={(event) => on && 'side' in on && setEffect(drawing.id, { ...on, side: event.target.value as Side })}
        >
          {SIDES.map((side) => (
            <option key={side} value={side}>
              {row.kind === 'slideIn' ? 'desde' : 'hacia'} {SIDE_NAMES[side]}
            </option>
          ))}
        </select>
      ) : null}
      {'duration' in shown ? (
        <NumberField
          label={`Segundos que dura: ${row.name}`}
          value={shown.duration}
          min={MIN_EFFECT_SECONDS}
          max={Math.max(MIN_EFFECT_SECONDS, barSeconds)}
          step={0.1}
          unit="s"
          disabled={!on}
          onCommit={(duration) => on && 'duration' in on && setEffect(drawing.id, { ...on, duration })}
        />
      ) : null}
      {'rate' in shown ? (
        <NumberField
          label={`Veces por segundo: ${row.name}`}
          value={shown.rate}
          min={MIN_RATE}
          max={MAX_RATE}
          step={0.5}
          unit="por s"
          disabled={!on}
          onCommit={(rate) => on && 'rate' in on && setEffect(drawing.id, { ...on, rate })}
        />
      ) : null}
    </div>
  )
}

function EffectsPanel({ drawing }: { drawing: Annotation }) {
  return (
    <div className={styles.effects}>
      <header className={styles.effectsHeader}>
        <strong>Efectos</strong>
        <span className={styles.effectsTarget}>{annotationLabel(drawing)}</span>
      </header>
      {GROUPS.map((group) => (
        <section key={group.title} className={styles.effectGroup}>
          <h3 className={styles.effectGroupTitle}>{group.title}</h3>
          {group.rows.map((row) => (
            <EffectToggleRow key={row.kind} drawing={drawing} row={row} />
          ))}
        </section>
      ))}
      <p className={styles.effectsHint}>
        Marcá un efecto y ajustá sus segundos. Se ven en la barra del dibujo y se exportan igual. Estirá la barra para darles más tiempo.
      </p>
    </div>
  )
}

/** Button after the keyframe one; opens the effects of the picked drawing. */
export function EffectsMenu({ small, edge }: { small: boolean; edge?: RefObject<HTMLElement | null> }) {
  const selectedId = useAnnotationStore((state) => state.selectedId)
  const drawing = useAnnotationStore((state) => state.annotations.find((annotation) => annotation.id === selectedId))
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLSpanElement>(null)

  // Nothing picked (or the drawing was deleted): there is nothing to show.
  useEffect(() => {
    if (!drawing) setOpen(false)
  }, [drawing])

  return (
    <span ref={anchor} className={styles.customAnchor}>
      <IconButton
        small={small}
        label={drawing ? 'Efectos del dibujo: aparecer, desvanecer, zoom, deslizar, parpadeo…' : 'Efectos: elegí antes un dibujo con el cursor'}
        active={open || (drawing ? hasEffects(drawing) : false)}
        disabled={!drawing}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Sparkles size={16} />
      </IconButton>
      {open && drawing ? (
        <Popover anchor={anchor} edge={edge} label="Efectos del dibujo" onClose={() => setOpen(false)}>
          <EffectsPanel drawing={drawing} />
        </Popover>
      ) : null}
    </span>
  )
}
