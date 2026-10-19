import type { ReactNode } from 'react'
import { ArrowUpRight, Check, Circle, PenLine, Snowflake, Square, Trash, Type, Undo2 } from 'lucide-react'
import { IconButton } from '@shared/ui/atoms'
import { SegmentedControl } from '@shared/ui/molecules'
import type { Annotation, ShapeKind } from '../domain/annotation'
import { DRAW_COLORS, DRAW_WIDTHS, useAnnotationStore } from './annotationStore'
import styles from './annotations.module.css'

const TOOLS: Array<{ kind: ShapeKind; label: string; icon: ReactNode }> = [
  { kind: 'arrow', label: 'Flecha', icon: <ArrowUpRight size={17} /> },
  { kind: 'ellipse', label: 'Círculo', icon: <Circle size={16} /> },
  { kind: 'rect', label: 'Rectángulo', icon: <Square size={15} /> },
  { kind: 'pen', label: 'Lápiz', icon: <PenLine size={16} /> },
  { kind: 'text', label: 'Texto', icon: <Type size={16} /> }
]

const SHOW_OPTIONS = [1, 2, 3, 5] as const
const FREEZE_OPTIONS = [0, 1, 2, 3] as const

interface AnnotationToolbarProps {
  /** Drawing on the frame on screen, if any: the timing controls edit it. */
  active: Annotation | undefined
  onUndo: () => void
  onDelete: (id: string) => void
  onClose: () => void
}

export function AnnotationToolbar({ active, onUndo, onDelete, onClose }: AnnotationToolbarProps) {
  const { tool, color, width, showFor, freezeFor, setTool, setColor, setWidth, setShowFor, setFreezeFor } = useAnnotationStore()
  const currentShow = active?.showFor ?? showFor
  const currentFreeze = active?.freezeFor ?? freezeFor

  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Herramientas de dibujo" onClick={(event) => event.stopPropagation()}>
      <div className={styles.group}>
        {TOOLS.map((item) => (
          <IconButton key={item.kind} label={item.label} active={tool === item.kind} onClick={() => setTool(item.kind)}>
            {item.icon}
          </IconButton>
        ))}
      </div>

      <div className={styles.group} role="radiogroup" aria-label="Color">
        {DRAW_COLORS.map((swatch) => (
          <button
            key={swatch}
            type="button"
            role="radio"
            aria-checked={color === swatch}
            aria-label={`Color ${swatch}`}
            className={styles.swatch}
            style={{ background: swatch }}
            onClick={() => setColor(swatch)}
          />
        ))}
      </div>

      <div className={styles.group} role="radiogroup" aria-label="Grosor">
        {DRAW_WIDTHS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={width === option.value}
            title={option.label}
            aria-label={`Grosor ${option.label}`}
            className={styles.widthOption}
            onClick={() => setWidth(option.value)}
          >
            <span style={{ width: 4 + option.value * 900, height: 4 + option.value * 900, background: color }} />
          </button>
        ))}
      </div>

      <div className={styles.group}>
        <span className={styles.groupLabel}>Visible</span>
        <SegmentedControl
          label="Tiempo visible del dibujo"
          value={String(currentShow)}
          options={SHOW_OPTIONS.map((seconds) => ({ value: String(seconds), label: `${seconds}s` }))}
          onChange={(value) => setShowFor(Number(value), active?.id)}
        />
      </div>

      <div className={styles.group}>
        <span className={styles.groupLabel} title="Congela la imagen en este cuadro mientras se ve el dibujo">
          <Snowflake size={13} /> Congelar
        </span>
        <SegmentedControl
          label="Congelar imagen"
          value={String(currentFreeze)}
          options={FREEZE_OPTIONS.map((seconds) => ({ value: String(seconds), label: seconds === 0 ? 'No' : `${seconds}s` }))}
          onChange={(value) => setFreezeFor(Number(value), active?.id)}
        />
      </div>

      <div className={styles.group}>
        <IconButton label="Deshacer trazo (Ctrl+Z)" onClick={onUndo} disabled={!active}>
          <Undo2 size={16} />
        </IconButton>
        <IconButton label="Borrar dibujo de este cuadro (Supr)" onClick={() => active && onDelete(active.id)} disabled={!active}>
          <Trash size={16} />
        </IconButton>
        <IconButton label="Terminar de dibujar (D o Esc)" onClick={onClose}>
          <Check size={17} />
        </IconButton>
      </div>
    </div>
  )
}
