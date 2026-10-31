import { useEffect, useRef, useState, type RefObject } from 'react'
import { Sparkles } from 'lucide-react'
import { IconButton } from '@shared/ui/atoms'
import type { Messages } from '@shared/i18n'
import { Popover } from '@shared/ui/organisms/Popover'
import { useT } from '@shared/ui/useT'
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

/** Effects by where they act on the drawing's bar; the title of each group says it, so the rows stay short. */
const GROUPS: ReadonlyArray<{ title: (t: Messages) => string; rows: readonly EffectKind[] }> = [
  { title: (t) => t.effects.atStart, rows: ['fadeIn', 'zoomIn', 'slideIn'] },
  { title: (t) => t.effects.atEnd, rows: ['fadeOut', 'zoomOut', 'slideOut'] },
  { title: (t) => t.effects.whileShown, rows: ['blink', 'pulse'] }
]

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
  const t = useT()

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
        title={t.effects.nudge(label)}
        inputMode="decimal"
        spellCheck={false}
        disabled={disabled}
        value={draft ?? t.format.number(value)}
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

function EffectToggleRow({ drawing, kind }: { drawing: Annotation; kind: EffectKind }) {
  const setEffect = useAnnotationStore((state) => state.setEffect)
  const removeEffect = useAnnotationStore((state) => state.removeEffect)
  const t = useT()
  const on = effectOf(drawing, kind)
  // Off rows show what turning them on would give.
  const shown = on ?? DEFAULT_EFFECTS[kind]
  const barSeconds = drawing.end - drawing.start
  const id = `effect-${kind}`
  const name = t.effects.rows[kind]

  return (
    <div className={styles.effectRow} data-on={on ? '' : undefined}>
      <input
        id={id}
        type="checkbox"
        className={styles.effectCheck}
        checked={Boolean(on)}
        onChange={(event) => (event.target.checked ? setEffect(drawing.id, DEFAULT_EFFECTS[kind]) : removeEffect(drawing.id, kind))}
      />
      <label htmlFor={id} className={styles.effectName}>
        {name}
      </label>
      {'side' in shown ? (
        <select
          className={styles.effectSide}
          aria-label={kind === 'slideIn' ? t.effects.from : t.effects.to}
          disabled={!on}
          value={shown.side}
          onChange={(event) => on && 'side' in on && setEffect(drawing.id, { ...on, side: event.target.value as Side })}
        >
          {SIDES.map((side) => (
            <option key={side} value={side}>
              {(kind === 'slideIn' ? t.effects.fromSide : t.effects.toSide)[side]}
            </option>
          ))}
        </select>
      ) : null}
      {'duration' in shown ? (
        <NumberField
          label={t.effects.seconds(name)}
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
          label={t.effects.perSecond(name)}
          value={shown.rate}
          min={MIN_RATE}
          max={MAX_RATE}
          step={0.5}
          unit={t.effects.perSecondUnit}
          disabled={!on}
          onCommit={(rate) => on && 'rate' in on && setEffect(drawing.id, { ...on, rate })}
        />
      ) : null}
    </div>
  )
}

function EffectsPanel({ drawing }: { drawing: Annotation }) {
  const t = useT()
  return (
    <div className={styles.effects}>
      <header className={styles.effectsHeader}>
        <strong>{t.effects.title}</strong>
        <span className={styles.effectsTarget}>{annotationLabel(drawing)}</span>
      </header>
      {GROUPS.map((group) => (
        <section key={group.rows[0]} className={styles.effectGroup}>
          <h3 className={styles.effectGroupTitle}>{group.title(t)}</h3>
          {group.rows.map((kind) => (
            <EffectToggleRow key={kind} drawing={drawing} kind={kind} />
          ))}
        </section>
      ))}
      <p className={styles.effectsHint}>{t.effects.hint}</p>
    </div>
  )
}

/** Button after the keyframe one; opens the effects of the picked drawing. */
export function EffectsMenu({ small, edge }: { small: boolean; edge?: RefObject<HTMLElement | null> }) {
  const selectedId = useAnnotationStore((state) => state.selectedId)
  const drawing = useAnnotationStore((state) => state.annotations.find((annotation) => annotation.id === selectedId))
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLSpanElement>(null)
  const t = useT()

  // Nothing picked (or the drawing was deleted): there is nothing to show.
  useEffect(() => {
    if (!drawing) setOpen(false)
  }, [drawing])

  return (
    <span ref={anchor} className={styles.customAnchor}>
      <IconButton
        small={small}
        label={drawing ? t.effects.button : t.effects.buttonNeedsPick}
        active={open || (drawing ? hasEffects(drawing) : false)}
        disabled={!drawing}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Sparkles size={16} />
      </IconButton>
      {open && drawing ? (
        <Popover anchor={anchor} edge={edge} label={t.effects.popover} onClose={() => setOpen(false)}>
          <EffectsPanel drawing={drawing} />
        </Popover>
      ) : null}
    </span>
  )
}
