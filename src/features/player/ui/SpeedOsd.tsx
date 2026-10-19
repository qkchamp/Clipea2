import styles from './player.module.css'

/** MPC-HC style on-screen message (e.g. "Velocidad 0.75x"), fades out by itself. */
export function SpeedOsd({ osd }: { osd: { text: string; id: number } | null }) {
  if (!osd) return null
  return (
    <div key={osd.id} className={styles.osd} role="status">
      {osd.text}
    </div>
  )
}
