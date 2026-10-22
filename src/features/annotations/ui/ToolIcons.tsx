/**
 * The arrow tool's icon, drawn like the arrow it makes: a shaft and a solid triangular head. Lucide's
 * ArrowUpRight is a thin corner on a short stroke, which looks small and light next to the circle,
 * the square and the pen. Same 24 grid and stroke as the other icons, so it lines up with them.
 */
export function ArrowToolIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 19 15.4 8.6" />
      <path d="M19 5 16.2 13 11 7.8Z" fill="currentColor" />
    </svg>
  )
}
