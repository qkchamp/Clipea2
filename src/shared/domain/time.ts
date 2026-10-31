import { getT } from '@shared/i18n'

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

const pad = (value: number, size = 2): string => String(value).padStart(size, '0')

/** 75.5 → "1:15.50"; 3725 → "1:02:05.00". Negative or invalid values render as zero. */
export function formatTime(seconds: number, decimals = 2): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0
  const factor = 10 ** decimals
  const totalUnits = Math.round(safe * factor)
  const fraction = totalUnits % factor
  const totalSeconds = Math.floor(totalUnits / factor)
  const s = totalSeconds % 60
  const m = Math.floor(totalSeconds / 60) % 60
  const h = Math.floor(totalSeconds / 3600)
  const decimalsPart = decimals > 0 ? `.${pad(fraction, decimals)}` : ''
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}${decimalsPart}` : `${m}:${pad(s)}${decimalsPart}`
}

/** Human duration: 9.5 → "9,5 s" ("9.5 s" in English), 75 → "1:15", 3725 → "1:02:05". */
export function formatDuration(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0
  if (safe < 60) return getT().format.seconds(safe)
  return formatTime(safe, 0)
}

/** An hour of the day (0–23) on a 12-hour clock: 0 → "12 AM", 16 → "4 PM". */
export function formatHourOfDay(hour: number): string {
  return `${hour % 12 || 12} ${hour < 12 ? 'AM' : 'PM'}`
}

/**
 * Parses what a person would type in a time field.
 * Accepts "50", "50,5", "1:19", "01:19.250", "1:02:03", "1m19s", "90s".
 */
export function parseTime(input: string): number | null {
  const text = input.trim().toLowerCase().replace(',', '.')
  if (text === '') return null

  if (/^\d+(\.\d+)?$/.test(text)) return Number(text)

  if (/^\d+(:\d{1,2}){1,2}(\.\d+)?$/.test(text)) {
    const parts = text.split(':').map(Number)
    const [first, ...rest] = parts
    if (rest.some((part) => part >= 60)) return null
    return parts.length === 3 ? first * 3600 + rest[0] * 60 + rest[1] : first * 60 + rest[0]
  }

  const units = /^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?$/.exec(text.replace(/\s+/g, ''))
  if (units && (units[1] || units[2] || units[3])) {
    return Number(units[1] ?? 0) * 3600 + Number(units[2] ?? 0) * 60 + Number(units[3] ?? 0)
  }
  return null
}

const MEGABYTE = 1_000_000

/** Decimal units, like Discord: 14_200_000 → "14,2 MB" ("14.2 MB" in English). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB'
  if (bytes < MEGABYTE) return `${Math.max(1, Math.round(bytes / 1000))} KB`
  return `${getT().format.decimal(bytes / MEGABYTE, 1)} MB`
}
