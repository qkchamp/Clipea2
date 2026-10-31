import { Fragment } from 'react'
import type { Messages } from '@shared/i18n'
import { Kbd } from '@shared/ui/atoms'
import { Dialog } from '@shared/ui/organisms/Dialog'
import { useT } from '@shared/ui/useT'
import styles from './shortcuts.module.css'

type Group = { title: string; items: Array<{ keys: string[][]; what: string }> }

function groupsFor(t: Messages): Group[] {
  const { keys } = t.shortcuts
  return [
    {
      title: t.shortcuts.player,
      items: [
        { keys: [[keys.space], ['K']], what: t.shortcuts.playPause },
        { keys: [['Ctrl', '←'], ['Ctrl', '→']], what: t.shortcuts.frameStep },
        { keys: [['Ctrl', '↓'], ['Ctrl', '↑']], what: t.shortcuts.speed },
        { keys: [['Ctrl', 'R']], what: t.shortcuts.speedReset },
        { keys: [['←'], ['→']], what: t.shortcuts.seek },
        { keys: [['M']], what: t.shortcuts.mute }
      ]
    },
    {
      title: t.shortcuts.trimAndMontage,
      items: [
        { keys: [['I'], ['O']], what: t.shortcuts.markInOut },
        { keys: [[keys.home], [keys.end]], what: t.shortcuts.goToEdges },
        { keys: [['Enter']], what: t.shortcuts.addToMontage },
        { keys: [[keys.wheel]], what: t.shortcuts.wheelStep },
        { keys: [['Ctrl', keys.wheel]], what: t.shortcuts.wheelZoom },
        { keys: [['Shift', keys.wheel]], what: t.shortcuts.wheelPan },
        { keys: [['Ctrl', 'O']], what: t.shortcuts.openOther }
      ]
    },
    {
      title: t.shortcuts.drawingAndExport,
      items: [
        { keys: [['D']], what: t.shortcuts.draw },
        { keys: [['Ctrl', 'Z']], what: t.shortcuts.undo },
        { keys: [['Ctrl', 'Y'], ['Ctrl', 'Shift', 'Z']], what: t.shortcuts.redo },
        { keys: [[keys.delete]], what: t.shortcuts.deleteDrawing },
        { keys: [['Ctrl', 'E']], what: t.shortcuts.exportToDisk }
      ]
    }
  ]
}

export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  const t = useT()
  return (
    <Dialog title={t.shortcuts.title} onClose={onClose}>
      <div className={styles.groups}>
        {groupsFor(t).map((group) => (
          <section key={group.title}>
            <h3 className={styles.groupTitle}>{group.title}</h3>
            <dl className={styles.list}>
              {group.items.map((item) => (
                <Fragment key={item.what}>
                  <dt className={styles.keys}>
                    {item.keys.map((combo, index) => (
                      <span key={combo.join('+')} className={styles.combo}>
                        {index > 0 ? <span className={styles.separator}>/</span> : null}
                        {combo.map((key) => (
                          <Kbd key={key}>{key}</Kbd>
                        ))}
                      </span>
                    ))}
                  </dt>
                  <dd className={styles.what}>{item.what}</dd>
                </Fragment>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  )
}
