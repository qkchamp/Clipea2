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

export function filterGames(games: readonly GameFolder[], query: string): GameFolder[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return [...games]
  return games
    .map((game) =>
      game.name.toLowerCase().includes(needle)
        ? game
        : { ...game, clips: game.clips.filter((clip) => clip.fileName.toLowerCase().includes(needle)) }
    )
    .filter((game) => game.clips.length > 0)
}
