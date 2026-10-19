/** Reloads allowed inside the window before the error is shown: a broken file fails every time. */
export const MAX_RECOVERIES = 3
export const RECOVERY_WINDOW_MS = 10_000

/** MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED: the file itself cannot be played, reloading will not help. */
const SRC_NOT_SUPPORTED = 4

/**
 * Fast scrubbing can trip the GPU video decoder mid-seek and leave the <video> dead even though the
 * file is fine. Those errors are recovered by reloading at the same spot, a few times at most.
 */
export function canRecover(errorCode: number | undefined, recentAttempts: readonly number[], now: number): boolean {
  if (errorCode === SRC_NOT_SUPPORTED) return false
  return recentAttempts.filter((at) => now - at < RECOVERY_WINDOW_MS).length < MAX_RECOVERIES
}
