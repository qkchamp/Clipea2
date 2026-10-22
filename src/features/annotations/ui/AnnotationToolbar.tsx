import { useRef, type ReactNode } from 'react'
import { Check, Circle, DiamondMinus, DiamondPlus, MousePointer2, PenLine, Redo2, Square, Type, Undo2 } from 'lucide-react'
import { Button, IconButton } from '@shared/ui/atoms'
import { useCrowded } from '@shared/ui/useCrowded'
import { DRAW_COLORS, DRAW_WIDTHS, useAnnotationStore, type DrawTool } from './annotationStore'
import { CustomColor } from './CustomColor'
import { EffectsMenu } from './EffectsMenu'
import { ArrowToolIcon } from './ToolIcons'
import styles from './annotations.module.css'

const TOOLS: Array<{ kind: DrawTool; label: string; icon: ReactNode }> = [
  { kind: 'select', label: 'Mover dibujos (doble clic en un texto para editarlo)', icon: <MousePointer2 size={16} /> },
  { kind: 'arrow', label: 'Flecha', icon: <ArrowToolIcon size={16} /> },
  { kind: 'ellipse', label: 'Círculo', icon: <Circle size={16} /> },
  { kind: 'rect', label: 'Rectángulo', icon: <Square size={15} /> },
  { kind: 'pen', label: 'Lápiz', icon: <PenLine size={16} /> },
  { kind: 'text', label: 'Texto', icon: <Type size={16} /> }
]

interface AnnotationToolbarProps {
  canUndo: boolean
  canRedo: boolean
  /** What the keyframe button does on the selected drawing at this frame ('none': nothing selected on screen). */
  keyframe: 'add' | 'remove' | 'none'
  onUndo: () => void
  onRedo: () => void
  onKeyframe: () => void
  onClose: () => void
}

/**
 * One row above the video: tools, color, thickness, keyframe and effects of the picked drawing,
 * undo/redo and "Listo". How long each drawing lasts is set on its bar in the timeline. In a narrow
 * window it shrinks before wrapping.
 */
export function AnnotationToolbar({ canUndo, canRedo, keyframe, onUndo, onRedo, onKeyframe, onClose }: AnnotationToolbarProps) {
  const { tool, color, width, setTool, setColor, setWidth } = useAnnotationStore()
  const row = useRef<HTMLDivElement>(null)
  const crowded = useCrowded(row, 'parent')

  return (
    <div ref={row} className={styles.toolbar} role="toolbar" aria-label="Herramientas de dibujo" onClick={(event) => event.stopPropagation()}>
      <div className={styles.group}>
        {TOOLS.map((item) => (
          <IconButton key={item.kind} small={crowded} label={item.label} active={tool === item.kind} onClick={() => setTool(item.kind)}>
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
        <CustomColor />
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
        <IconButton
          small={crowded}
          label={
            keyframe === 'remove'
              ? 'Quitar el keyframe de este cuadro'
              : 'Keyframe en este cuadro: fija dónde está el dibujo elegido. En otro cuadro, arrastralo y se mueve solo entre los dos'
          }
          active={keyframe === 'remove'}
          disabled={keyframe === 'none'}
          onClick={onKeyframe}
        >
          {keyframe === 'remove' ? <DiamondMinus size={16} /> : <DiamondPlus size={16} />}
        </IconButton>
        <EffectsMenu small={crowded} />
      </div>

      <div className={styles.group}>
        <IconButton small={crowded} label="Deshacer (Ctrl+Z)" onClick={onUndo} disabled={!canUndo}>
          <Undo2 size={16} />
        </IconButton>
        <IconButton small={crowded} label="Rehacer (Ctrl+Y)" onClick={onRedo} disabled={!canRedo}>
          <Redo2 size={16} />
        </IconButton>
      </div>

      <div className={styles.group}>
        <Button
          size="sm"
          variant="primary"
          icon={<Check size={14} />}
          title="Terminar de dibujar (D o Esc)"
          aria-label={crowded ? 'Listo' : undefined}
          onClick={onClose}
        >
          {crowded ? null : 'Listo'}
        </Button>
      </div>
    </div>
  )
}
