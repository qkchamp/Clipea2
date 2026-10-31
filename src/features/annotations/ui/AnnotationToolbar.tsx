import { useRef, type ReactNode } from 'react'
import { Check, Circle, DiamondMinus, DiamondPlus, MousePointer2, PenLine, Redo2, Square, Trash2, Type, Undo2 } from 'lucide-react'
import { Button, IconButton } from '@shared/ui/atoms'
import { cx } from '@shared/ui/cx'
import { useCrowded } from '@shared/ui/useCrowded'
import { useT } from '@shared/ui/useT'
import { DRAW_COLORS, DRAW_WIDTHS, useAnnotationStore, type DrawTool } from './annotationStore'
import { CustomColor } from './CustomColor'
import { EffectsMenu } from './EffectsMenu'
import { ArrowToolIcon } from './ToolIcons'
import styles from './annotations.module.css'

const TOOLS: Array<{ kind: DrawTool; icon: ReactNode }> = [
  { kind: 'select', icon: <MousePointer2 size={16} /> },
  { kind: 'arrow', icon: <ArrowToolIcon size={16} /> },
  { kind: 'ellipse', icon: <Circle size={16} /> },
  { kind: 'rect', icon: <Square size={14} /> },
  { kind: 'pen', icon: <PenLine size={16} /> },
  { kind: 'text', icon: <Type size={16} /> }
]

interface AnnotationToolbarProps {
  canUndo: boolean
  canRedo: boolean
  /** What the keyframe button does on the selected drawing at this frame ('none': nothing selected on screen). */
  keyframe: 'add' | 'remove' | 'none'
  /** A drawing of this video is picked (with the cursor or on its bar). */
  canDelete: boolean
  onUndo: () => void
  onRedo: () => void
  onKeyframe: () => void
  onDelete: () => void
  onClose: () => void
}

/**
 * One row above the video: tools, color, thickness, keyframe, effects and delete for the picked drawing,
 * undo/redo and "Listo". How long each drawing lasts is set on its bar in the timeline. In a narrow
 * window it shrinks before wrapping.
 */
export function AnnotationToolbar({ canUndo, canRedo, keyframe, canDelete, onUndo, onRedo, onKeyframe, onDelete, onClose }: AnnotationToolbarProps) {
  const { tool, color, width, setTool, setColor, setWidth } = useAnnotationStore()
  const row = useRef<HTMLDivElement>(null)
  const crowded = useCrowded(row, 'parent')
  const t = useT()

  return (
    <div ref={row} className={cx(styles.toolbar, crowded && styles.crowded)} role="toolbar" aria-label={t.drawing.toolbar} onClick={(event) => event.stopPropagation()}>
      <div className={styles.group}>
        {TOOLS.map((item) => (
          <IconButton key={item.kind} small label={t.drawing.tools[item.kind]} active={tool === item.kind} onClick={() => setTool(item.kind)}>
            {item.icon}
          </IconButton>
        ))}
      </div>

      <div className={styles.group} role="radiogroup" aria-label={t.drawing.color}>
        {DRAW_COLORS.map((swatch) => (
          <button
            key={swatch}
            type="button"
            role="radio"
            aria-checked={color === swatch}
            aria-label={t.drawing.colorNamed(swatch)}
            className={styles.swatch}
            style={{ background: swatch }}
            onClick={() => setColor(swatch)}
          />
        ))}
        <CustomColor edge={row} />
      </div>

      <div className={styles.group} role="radiogroup" aria-label={t.drawing.width}>
        {DRAW_WIDTHS.map((option) => {
          // An even size, so the dot sits centered on whole pixels in its even box.
          const dot = 2 * Math.round((4 + option.value * 900) / 2)
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={width === option.value}
              title={t.drawing.widths[option.name]}
              aria-label={t.drawing.widthNamed(t.drawing.widths[option.name])}
              className={styles.widthOption}
              onClick={() => setWidth(option.value)}
            >
              <span style={{ width: dot, height: dot, background: color }} />
            </button>
          )
        })}
      </div>

      <div className={styles.group}>
        <IconButton
          small
          label={
            keyframe === 'remove' ? t.drawing.removeKeyframe : t.drawing.addKeyframe
          }
          active={keyframe === 'remove'}
          disabled={keyframe === 'none'}
          onClick={onKeyframe}
        >
          {keyframe === 'remove' ? <DiamondMinus size={16} /> : <DiamondPlus size={16} />}
        </IconButton>
        <EffectsMenu small edge={row} />
        <IconButton
          small
          label={canDelete ? t.drawing.deleteSelected : t.drawing.deleteNeedsPick}
          disabled={!canDelete}
          onClick={onDelete}
        >
          <Trash2 size={16} />
        </IconButton>
      </div>

      <div className={styles.group}>
        <IconButton small label={t.drawing.undo} onClick={onUndo} disabled={!canUndo}>
          <Undo2 size={16} />
        </IconButton>
        <IconButton small label={t.drawing.redo} onClick={onRedo} disabled={!canRedo}>
          <Redo2 size={16} />
        </IconButton>
      </div>

      <div className={styles.group}>
        <Button
          size="sm"
          variant="primary"
          icon={<Check size={14} />}
          title={t.drawing.finishTitle}
          aria-label={crowded ? t.drawing.done : undefined}
          onClick={onClose}
        >
          {crowded ? null : t.drawing.done}
        </Button>
      </div>
    </div>
  )
}
