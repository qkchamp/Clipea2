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

/** The library search split into names and a day and time: "rematch 28/10/26 04:2". */
export interface LibrarySearch {
  /** The rest, lowercase: it matches game and file names as before. */
  text: string
  day: SearchDay | null
  /** The hour and the start of the minutes typed so far: "04:" any minute of 4 AM, "04:2" 04:20–04:29. */
  time: { hour: number; minutes: string } | null
}

const DAY_WORD = /^(\d{1,2})\/(\d{1,2})(?:\/(\d*))?$/
const TIME_WORD = /^(\d{1,2}):(\d{0,2})$/

function readDay(first: number, second: number, year: string): SearchDay | null {
  const fullYear = year.length === 2 ? 2000 + Number(year) : year.length === 4 ? Number(year) : null
  const isDay = (day: number, month: number): boolean => day >= 1 && day <= 31 && month >= 1 && month <= 12
  // Day first, as written in Spanish: 03/04 is the 3rd of April. MM/DD only when that is no date.
  if (isDay(first, second)) return { day: first, month: second, year: fullYear }
  if (isDay(second, first)) return { day: second, month: first, year: fullYear }
  return null
}

/**
 * Reads "28/10/26", "10/28/2026" or "28/10" (any year) as a day and "04:28" or "04:" as a time.
 * File and folder names on Windows can't hold "/" or ":": no clip was ever found by such a word,
 * so reading it as a date hides nothing. One that is no date stays a word and matches nothing.
 */
export function parseLibrarySearch(query: string): LibrarySearch {
  const words: string[] = []
  let day: SearchDay | null = null
  let time: LibrarySearch['time'] = null
  for (const word of query.trim().toLowerCase().split(/\s+/)) {
    const date = DAY_WORD.exec(word)
    const clock = TIME_WORD.exec(word)
    const typedDay = date ? readDay(Number(date[1]), Number(date[2]), date[3] ?? '') : null
    if (typedDay) day = typedDay
    else if (clock && Number(clock[1]) <= 23) time = { hour: Number(clock[1]), minutes: clock[2] }
    else if (word !== '') words.push(word)
  }
  return { text: words.join(' '), day, time }
}

function recordedWhen(ms: number, { day, time }: LibrarySearch): boolean {
  const at = new Date(ms)
  if (day && (at.getDate() !== day.day || at.getMonth() + 1 !== day.month || (day.year !== null && at.getFullYear() !== day.year))) {
    return false
  }
  return !time || (at.getHours() === time.hour && String(at.getMinutes()).padStart(2, '0').startsWith(time.minutes))
}

export function filterGames(games: readonly GameFolder[], query: string): GameFolder[] {
  const search = parseLibrarySearch(query)
  const timed = search.day !== null || search.time !== null
  if (search.text === '' && !timed) return [...games]
  return games
    .map((game) => {
      const named = game.name.toLowerCase().includes(search.text)
      const clips = game.clips.filter(
        (clip) => (named || clip.fileName.toLowerCase().includes(search.text)) && (!timed || recordedWhen(clipTimestamp(clip), search))
      )
      return clips.length === game.clips.length ? game : { ...game, clips }
    })
    .filter((game) => game.clips.length > 0)
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
  const words = query.trim().split(/\s+/).filter((word) => word !== '' && !DAY_WORD.test(word))
  return [...words, `${pad(at.getDate())}/${pad(at.getMonth() + 1)}/${pad(at.getFullYear() % 100)}`].join(' ')
}
