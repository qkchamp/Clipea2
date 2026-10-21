import { Fragment } from 'react'
import { Kbd } from '@shared/ui/atoms'
import { Dialog } from '@shared/ui/organisms/Dialog'
import styles from './shortcuts.module.css'

const GROUPS: Array<{ title: string; items: Array<{ keys: string[][]; what: string }> }> = [
  {
    title: 'Reproductor',
    items: [
      { keys: [['Espacio'], ['K']], what: 'Reproducir / pausar' },
      { keys: [['Ctrl', '←'], ['Ctrl', '→']], what: 'Cuadro anterior / siguiente' },
      { keys: [['Ctrl', '↓'], ['Ctrl', '↑']], what: 'Velocidad −0.25x / +0.25x' },
      { keys: [['Ctrl', 'R']], what: 'Volver a 1.00x' },
      { keys: [['←'], ['→']], what: 'Retroceder / avanzar 5 s (con Shift: 1 s)' },
      { keys: [['M']], what: 'Silenciar' }
    ]
  },
  {
    title: 'Recorte y montaje',
    items: [
      { keys: [['I'], ['O']], what: 'Marcar inicio / fin en el cuadro actual' },
      { keys: [['Inicio'], ['Fin']], what: 'Ir al inicio / fin de la selección' },
      { keys: [['Enter']], what: 'Agregar la selección al montaje (o guardar el corte editado)' },
      { keys: [['Ctrl', 'Rueda']], what: 'Zoom en la línea de tiempo (doble clic: ver todo)' },
      { keys: [['Ctrl', 'O']], what: 'Abrir un video de otra carpeta' }
    ]
  },
  {
    title: 'Dibujo y exportación',
    items: [
      { keys: [['D']], what: 'Dibujar sobre el cuadro actual (Esc para terminar)' },
      { keys: [['Ctrl', 'Z']], what: 'Deshacer (dibujos, cortes, dibujos borrados, vaciar montaje)' },
      { keys: [['Ctrl', 'Y'], ['Ctrl', 'Shift', 'Z']], what: 'Rehacer' },
      { keys: [['Supr']], what: 'Borrar el dibujo elegido (con el cursor o en su barra de la línea de tiempo)' },
      { keys: [['Ctrl', 'E']], what: 'Exportar a disco (elegís dónde guardarlo)' }
    ]
  }
]

export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Atajos de teclado" onClose={onClose}>
      <div className={styles.groups}>
        {GROUPS.map((group) => (
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
