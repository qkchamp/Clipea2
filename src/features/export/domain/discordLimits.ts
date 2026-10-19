const MB = 1_000_000

/**
 * Per-file upload limits from Discord's File Attachments FAQ (checked 2026-10-03):
 * free accounts went from 10 MB to 20 MB in August 2026; size is checked before any compression.
 * Discord does not say whether "MB" is decimal or binary, so decimal (the smaller one) is used.
 */
export const DISCORD_LIMITS = {
  free: 20 * MB,
  nitroBasic: 50 * MB,
  nitro: 1000 * MB
} as const

export const DEFAULT_SIZE_LIMIT_BYTES = DISCORD_LIMITS.free

export function megabytesToBytes(megabytes: number): number {
  return Math.round(megabytes * MB)
}

export function exceedsLimit(sizeBytes: number, limitBytes: number | null): boolean {
  return limitBytes !== null && sizeBytes > limitBytes
}
