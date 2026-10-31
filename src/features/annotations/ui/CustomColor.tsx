import { useRef, useState, type RefObject } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { Button } from '@shared/ui/atoms'
import { Popover } from '@shared/ui/organisms/Popover'
import { useT } from '@shared/ui/useT'
import { clampChannel, hexToRgb, inkOn, parseHex, rgbToHex, type Rgb } from '../domain/color'
import { useAnnotationStore } from './annotationStore'
import styles from './annotations.module.css'

const CHANNELS = [
  { key: 'r', letter: 'R' },
  { key: 'g', letter: 'G' },
  { key: 'b', letter: 'B' }
] as const

/** Gradient of one channel's slider: what the color becomes at its two ends, the other channels as they are. */
function trackOf(key: keyof Rgb, rgb: Rgb): string {
  const at = (value: number): string => {
    const mixed: Rgb = { ...rgb }
    mixed[key] = value
    return `rgb(${mixed.r}, ${mixed.g}, ${mixed.b})`
  }
  return `linear-gradient(to right, ${at(0)}, ${at(255)})`
}

function ColorMixer({ start, hasCustom, onUse, onReset }: { start: string; hasCustom: boolean; onUse: (hex: string) => void; onReset: () => void }) {
  const [rgb, setRgb] = useState<Rgb>(() => hexToRgb(start))
  const t = useT()
  // What is being typed in the hex box; null while it just shows the current color.
  const [typed, setTyped] = useState<string | null>(null)
  const hex = rgbToHex(rgb)
  const set = (key: keyof Rgb, value: number): void => setRgb((current) => ({ ...current, [key]: clampChannel(value) }))
  // Three digits ("#fc8") only count once the typing is done: halfway through a six digit code they would flash another color.
  const finishTyping = (): void => {
    const parsed = typed === null ? null : parseHex(typed, true)
    if (parsed) setRgb(parsed)
    setTyped(null)
  }

  return (
    <div className={styles.mixer}>
      <div className={styles.mixerPreview}>
        <span className={styles.mixerSample} style={{ background: hex }} />
        <input
          className={styles.mixerHex}
          aria-label={t.drawing.hexLabel}
          title={t.drawing.hexTitle}
          spellCheck={false}
          maxLength={7}
          value={typed ?? hex.toUpperCase()}
          data-invalid={(typed !== null && parseHex(typed, true) === null) || undefined}
          onFocus={(event) => event.target.select()}
          onChange={(event) => {
            setTyped(event.target.value)
            const parsed = parseHex(event.target.value)
            if (parsed) setRgb(parsed)
          }}
          onBlur={finishTyping}
          onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
        />
      </div>
      {CHANNELS.map(({ key, letter }) => (
        <div key={key} className={styles.channel}>
          <span className={styles.channelLetter} title={t.drawing.channels[key]}>
            {letter}
          </span>
          <input
            type="range"
            min={0}
            max={255}
            value={rgb[key]}
            aria-label={t.drawing.channels[key]}
            style={{ background: trackOf(key, rgb) }}
            onChange={(event) => set(key, Number(event.target.value))}
          />
          <input
            type="number"
            min={0}
            max={255}
            value={rgb[key]}
            aria-label={t.drawing.channelRange(t.drawing.channels[key])}
            className={styles.channelNumber}
            onChange={(event) => set(key, event.target.value === '' ? 0 : Number(event.target.value))}
            onFocus={(event) => event.target.select()}
          />
        </div>
      ))}
      <div className={styles.mixerActions}>
        {hasCustom ? (
          <Button size="sm" variant="ghost" onClick={onReset} title={t.drawing.resetColorTitle}>
            {t.drawing.resetColor}
          </Button>
        ) : null}
        <Button size="sm" variant="primary" onClick={() => onUse(hex)}>
          {t.drawing.useColor}
        </Button>
      </div>
    </div>
  )
}

/**
 * The swatch after the fixed colors. Empty ("+") until the user mixes one with RGB; then it holds that
 * color, and clicking it again offers to change it or clear it. Only one custom color for now.
 */
export function CustomColor({ edge }: { edge?: RefObject<HTMLElement | null> }) {
  const color = useAnnotationStore((state) => state.color)
  const customColor = useAnnotationStore((state) => state.customColor)
  const setColor = useAnnotationStore((state) => state.setColor)
  const setCustomColor = useAnnotationStore((state) => state.setCustomColor)
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLSpanElement>(null)
  const inUse = customColor !== null && color === customColor
  const t = useT()

  const onClick = (): void => {
    // A color that is already set is picked first; clicking it while in use is what opens the mixer.
    if (customColor !== null && !inUse) return setColor(customColor)
    setOpen((current) => !current)
  }

  return (
    <span ref={anchor} className={styles.customAnchor}>
      {customColor === null ? (
        <button
          type="button"
          className={`${styles.swatch} ${styles.swatchEmpty}`}
          aria-label={t.drawing.customNew}
          title={t.drawing.customNewTitle}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={onClick}
        >
          <Plus size={12} strokeWidth={2.5} />
        </button>
      ) : (
        <button
          type="button"
          role="radio"
          aria-checked={inUse}
          aria-label={t.drawing.customNamed(customColor)}
          title={t.drawing.customTitle}
          className={`${styles.swatch} ${styles.swatchCustom}`}
          style={{ background: customColor, color: inkOn(customColor) }}
          onClick={onClick}
        >
          {/* The pencil tells it apart from the fixed colors: this one can be changed. */}
          <Pencil strokeWidth={2.75} aria-hidden />
        </button>
      )}
      {open ? (
        <Popover anchor={anchor} edge={edge} label={t.drawing.custom} onClose={() => setOpen(false)}>
          <ColorMixer
            start={customColor ?? color}
            hasCustom={customColor !== null}
            onUse={(hex) => {
              setCustomColor(hex)
              setOpen(false)
            }}
            onReset={() => {
              setCustomColor(null)
              setOpen(false)
            }}
          />
        </Popover>
      ) : null}
    </span>
  )
}
