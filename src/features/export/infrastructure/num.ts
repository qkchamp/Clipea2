/** ffmpeg-friendly number: fixed precision without trailing zeros. */
export function num(value: number): string {
  return value.toFixed(6).replace(/\.?0+$/, '') || '0'
}
