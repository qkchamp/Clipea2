/**
 * Where a count sits between none and the most, 0–1, on a log scale: one day with 500 clips doesn't
 * leave every other day looking empty.
 */
export function heatLevel(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0
  return Math.min(1, Math.log1p(count) / Math.log1p(max))
}
