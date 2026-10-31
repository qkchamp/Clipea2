import { formatHourOfDay } from '@shared/domain/time'

export const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.mov', '.webm', '.m4v'] as const

export interface LibraryClip {
  path: string
  fileName: string
  /** Folder name; ShadowPlay stores one folder per game. */
  game: string
  folderPath: string
  sizeBytes: number
  modifiedMs: number
  recordedAtMs: number | null
  isInstantReplay: boolean
}

export interface GameFolder {
  name: string
  path: string
  clips: LibraryClip[]
  latestMs: number
}

export interface LibraryScan {
  root: string
  games: GameFolder[]
  totalClips: number
}

/** "How To Fish 2026.09.16 - 02.47.12.06.DVR.mp4" → 2026-09-16 02:47:12 */
const SHADOWPLAY_STAMP = /(\d{4})\.(\d{2})\.(\d{2}) - (\d{2})\.(\d{2})\.(\d{2})/

/** Exports in progress are written as "<name>.<job>.partial.mp4" and renamed when done. */
export const PARTIAL_EXPORT_SUFFIX = '.partial.mp4'

export function isVideoFile(fileName: string): boolean {
  const lower = fileName.toLowerCase()
  if (lower.endsWith(PARTIAL_EXPORT_SUFFIX)) return false
  return VIDEO_EXTENSIONS.some((extension) => lower.endsWith(extension))
}

export function parseRecordedAt(fileName: string): number | null {
  const match = SHADOWPLAY_STAMP.exec(fileName)
  if (!match) return null
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number)
  const date = new Date(year, month - 1, day, hour, minute, second)
  return date.getMonth() === month - 1 ? date.getTime() : null
}

/** ShadowPlay names Instant Replay saves "<game> <stamp>.DVR.mp4". */
export function isInstantReplay(fileName: string): boolean {
  return /\.dvr\.[a-z0-9]+$/i.test(fileName)
}

export function clipTimestamp(clip: LibraryClip): number {
  return clip.recordedAtMs ?? clip.modifiedMs
}

export function stripExtension(fileName: string): string {
  return fileName.replace(/(\.dvr)?\.[a-z0-9]+$/i, '')
}

export function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

/** "How To Fish 2026.09.16 - 02.47.12.06.DVR.mp4" → title "How To Fish" + recording time. */
export function describeRecording(fileName: string): { title: string; recordedAtMs: number | null } {
  const name = stripExtension(fileName)
  const match = SHADOWPLAY_STAMP.exec(name)
  const title = match ? name.slice(0, match.index).trim() : ''
  return { title: title || name, recordedAtMs: parseRecordedAt(fileName) }
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** 2026-09-16 02:47 → "16 sep · 02:47" */
export function formatRecordedAt(ms: number): string {
  const date = new Date(ms)
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  return `${date.getDate()} ${MONTHS[date.getMonth()]} · ${time}`
}

/** Short label for a recording: "How To Fish · 16 sep · 02:47". */
export function recordingLabel(path: string): string {
  const { title, recordedAtMs } = describeRecording(baseName(path))
  return recordedAtMs === null ? title : `${title} · ${formatRecordedAt(recordedAtMs)}`
}

export function groupByGame(clips: readonly LibraryClip[]): GameFolder[] {
  const byFolder = new Map<string, GameFolder>()
  for (const clip of clips) {
    const folder = byFolder.get(clip.folderPath) ?? { name: clip.game, path: clip.folderPath, clips: [], latestMs: 0 }
    folder.clips.push(clip)
    folder.latestMs = Math.max(folder.latestMs, clipTimestamp(clip))
    byFolder.set(clip.folderPath, folder)
  }
  const folders = [...byFolder.values()]
  for (const folder of folders) folder.clips.sort((a, b) => clipTimestamp(b) - clipTimestamp(a))
  return folders.sort((a, b) => b.latestMs - a.latestMs)
}

/** A day typed in the search. `month` 1–12; `year` null until it has 2 or 4 digits: any year. */
export interface SearchDay {
  day: number
  month: number
  year: number | null
}

/** A time typed in the search: the hour (0–23) and the start of the minutes typed so far. */
export interface SearchTime {
  hour: number
  /** "" any minute of the hour, "2" 20–29, "28" just that one. */
  minutes: string
}

/** The library search split into names and a day and time: "rematch 28/10/26 04:2". */
export interface LibrarySearch {
  /** The rest, lowercase: it matches game and file names as before. */
  text: string
  day: SearchDay | null
  time: SearchTime | null
}

const DAY_WORD = /^(\d{1,2})\/(\d{1,2})(?:\/(\d*))?$/
/** "04:28", "04:", "4 PM", "4:30pm": a time has its colon or its AM/PM. */
const TIME_WORD = /^(\d{1,2})(:(\d{0,2}))?(?: ?([ap]m))?$/i

function readTime(word: string): SearchTime | null {
  const match = TIME_WORD.exec(word)
  if (!match || (!match[2] && !match[4])) return null
  const hour = Number(match[1])
  const minutes = match[3] ?? ''
  const half = match[4]?.toLowerCase()
  if (!half) return hour <= 23 ? { hour, minutes } : null
  if (hour < 1 || hour > 12) return null
  return { hour: (hour % 12) + (half === 'pm' ? 12 : 0), minutes }
}

/** The words of a search, with "4 PM" kept as one. */
function searchWords(query: string): string[] {
  const words: string[] = []
  for (const word of query.trim().split(/\s+/)) {
    const last = words.length - 1
    if (/^[ap]m$/i.test(word) && /^\d{1,2}(:\d{0,2})?$/.test(words[last] ?? '')) words[last] = `${words[last]} ${word}`
    else if (word !== '') words.push(word)
  }
  return words
}

function readDay(first: number, second: number, year: string): SearchDay | null {
  const fullYear = year.length === 2 ? 2000 + Number(year) : year.length === 4 ? Number(year) : null
  const isDay = (day: number, month: number): boolean => day >= 1 && day <= 31 && month >= 1 && month <= 12
  // Day first, as written in Spanish: 03/04 is the 3rd of April. MM/DD only when that is no date.
  if (isDay(first, second)) return { day: first, month: second, year: fullYear }
  if (isDay(second, first)) return { day: second, month: first, year: fullYear }
  return null
}

/**
 * Reads "28/10/26", "10/28/2026" or "28/10" (any year) as a day and "04:28", "04:" or "4 PM" as a time.
 * File and folder names on Windows can't hold "/" or ":", so those words never found a clip by name;
 * only "4 PM" could, and a clip named like that is rare. A word that is no date stays a word.
 */
export function parseLibrarySearch(query: string): LibrarySearch {
  const words: string[] = []
  let day: SearchDay | null = null
  let time: SearchTime | null = null
  for (const word of searchWords(query.toLowerCase())) {
    const date = DAY_WORD.exec(word)
    const typedDay = date ? readDay(Number(date[1]), Number(date[2]), date[3] ?? '') : null
    const typedTime = typedDay ? null : readTime(word)
    if (typedDay) day = typedDay
    else if (typedTime) time = typedTime
    else words.push(word)
  }
  return { text: words.join(' '), day, time }
}

function recordedWhen(ms: number, { day, time }: LibrarySearch): boolean {
  if (!day && !time) return true
  const at = new Date(ms)
  if (day && (at.getDate() !== day.day || at.getMonth() + 1 !== day.month || (day.year !== null && at.getFullYear() !== day.year))) {
    return false
  }
  return !time || (at.getHours() === time.hour && String(at.getMinutes()).padStart(2, '0').startsWith(time.minutes))
}

/** The clips of a game the search finds: all of them when the game's name matches the words. */
function foundIn(game: GameFolder, search: LibrarySearch): LibraryClip[] {
  const named = game.name.toLowerCase().includes(search.text)
  return game.clips.filter((clip) => (named || clip.fileName.toLowerCase().includes(search.text)) && recordedWhen(clipTimestamp(clip), search))
}

export function filterGames(games: readonly GameFolder[], query: string): GameFolder[] {
  const search = parseLibrarySearch(query)
  if (search.text === '' && !search.day && !search.time) return [...games]
  return games
    .map((game) => {
      const clips = foundIn(game, search)
      return clips.length === game.clips.length ? game : { ...game, clips }
    })
    .filter((game) => game.clips.length > 0)
}

/** "2026-10-28": a day's key in clipsPerDay. */
export function dayKey(at: Date): string {
  return `${at.getFullYear()}-${at.getMonth() + 1}-${at.getDate()}`
}

/**
 * Clips per day (by dayKey) among those the rest of the search finds: the day typed is left out,
 * so the calendar shows where the clips of "rematch" or of "4 PM" are.
 */
export function clipsPerDay(games: readonly GameFolder[], query: string): Map<string, number> {
  const search = { ...parseLibrarySearch(query), day: null }
  const counts = new Map<string, number>()
  for (const game of games) {
    for (const clip of foundIn(game, search)) {
      const key = dayKey(new Date(clipTimestamp(clip)))
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return counts
}

/** Clips per hour of the day (0–23) among those the rest of the search finds, the time typed left out. */
export function clipsPerHour(games: readonly GameFolder[], query: string): number[] {
  const search = { ...parseLibrarySearch(query), time: null }
  const counts = Array.from({ length: 24 }, () => 0)
  for (const game of games) {
    for (const clip of foundIn(game, search)) counts[new Date(clipTimestamp(clip)).getHours()]++
  }
  return counts
}

/** The day in the search as a date, in `year` when it has none; null without one or for 31/02. */
export function dayInSearch(query: string, year: number): Date | null {
  const { day } = parseLibrarySearch(query)
  if (!day) return null
  const date = new Date(day.year ?? year, day.month - 1, day.day)
  return date.getMonth() === day.month - 1 ? date : null
}

/** The search with this day in it, in place of the one typed before: "rematch" → "rematch 28/10/26". */
export function searchOnDay(query: string, at: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  const words = searchWords(query).filter((word) => !DAY_WORD.test(word))
  return [...words, `${pad(at.getDate())}/${pad(at.getMonth() + 1)}/${pad(at.getFullYear() % 100)}`].join(' ')
}

/** The hour in the search (0–23), or null. */
export function hourInSearch(query: string): number | null {
  return parseLibrarySearch(query).time?.hour ?? null
}

/** The search with this hour in it, in place of the time typed before: "28/10/26" → "28/10/26 4 PM". */
export function searchOnHour(query: string, hour: number): string {
  return [...searchWords(query).filter((word) => !readTime(word)), formatHourOfDay(hour)].join(' ')
}
