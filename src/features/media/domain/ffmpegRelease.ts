/**
 * Where Clipea2 installs ffmpeg from: gyan.dev's "essentials" release build for Windows (static,
 * GPLv3, with NVENC, AMF and QSV). The version and checksum files sit next to the zip.
 */
export const FFMPEG_RELEASE = {
  zip: 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip',
  version: 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip.ver',
  sha256: 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip.sha256'
} as const

export type FfmpegInstallProgress =
  | { stage: 'downloading'; receivedBytes: number; totalBytes: number | null }
  | { stage: 'extracting' }

/** "8.1.2-full_build-www.gyan.dev" → [8, 1, 2]; null for builds without a release number (git snapshots). */
export function releaseNumber(version: string): number[] | null {
  const match = /^(\d+(?:\.\d+)*)(?:$|[^\d.])/.exec(version.trim())
  return match ? match[1].split('.').map(Number) : null
}

function compareReleases(a: number[], b: number[]): number {
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

/** True when `latest` is a later release than `installed`. An installed build without a number is left alone. */
export function isNewerRelease(latest: string, installed: string | null): boolean {
  const next = releaseNumber(latest)
  if (!next) return false
  if (installed === null) return true
  const current = releaseNumber(installed)
  return current !== null && compareReleases(next, current) > 0
}

/** The newest of the version folders Clipea2 installed ("8.1.2", "9.0.2"); other names are ignored. */
export function newestRelease(folders: readonly string[]): string | null {
  let newest: { name: string; number: number[] } | null = null
  for (const name of folders) {
    const number = /^\d+(?:\.\d+)*$/.test(name) ? releaseNumber(name) : null
    if (number && (!newest || compareReleases(number, newest.number) > 0)) newest = { name, number }
  }
  return newest?.name ?? null
}
