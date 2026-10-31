import { getT } from '@shared/i18n'
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { access, mkdir, readdir, rename, rm } from 'node:fs/promises'
import { once } from 'node:events'
import { join } from 'node:path'
import { FFMPEG_RELEASE, newestRelease, releaseNumber, type FfmpegInstallProgress } from '../domain/ffmpegRelease'
import { runProcess } from './processRunner'

/** The app's fetch (Electron's, so it goes through the system proxy like the browser does). */
export type FetchUrl = (url: string) => Promise<Response>

const BINARIES = ['ffmpeg.exe', 'ffprobe.exe'] as const
/** Where downloads and unzipping happen, inside the install folder so the final move is a rename. */
const WORK_DIR = '.descarga'

async function fetchText(fetchUrl: FetchUrl, url: string, failed: (status: number) => string): Promise<string> {
  const response = await fetchUrl(url)
  if (!response.ok) throw new Error(failed(response.status))
  return (await response.text()).trim()
}

export async function fetchLatestFfmpegVersion(fetchUrl: FetchUrl): Promise<string> {
  const version = await fetchText(fetchUrl, FFMPEG_RELEASE.version, getT().ffmpeg.latestFailed)
  if (!releaseNumber(version)) throw new Error(getT().ffmpeg.badVersion(version))
  return version
}

/** Streams the zip to disk, reporting progress, and returns its SHA-256. */
async function download(fetchUrl: FetchUrl, path: string, onProgress: (progress: FfmpegInstallProgress) => void): Promise<string> {
  const response = await fetchUrl(FFMPEG_RELEASE.zip)
  if (!response.ok || !response.body) throw new Error(getT().ffmpeg.downloadFailed(response.status))
  const totalBytes = Number(response.headers.get('content-length')) || null
  const hash = createHash('sha256')
  const file = createWriteStream(path)
  let receivedBytes = 0
  let reportedAt = 0
  try {
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      hash.update(chunk)
      receivedBytes += chunk.byteLength
      if (!file.write(chunk)) await once(file, 'drain')
      // A few updates per second are enough for the bar; one per chunk would flood the IPC.
      if (Date.now() - reportedAt > 150) {
        reportedAt = Date.now()
        onProgress({ stage: 'downloading', receivedBytes, totalBytes })
      }
    }
  } finally {
    file.end()
    await once(file, 'close')
  }
  onProgress({ stage: 'downloading', receivedBytes, totalBytes: totalBytes ?? receivedBytes })
  return hash.digest('hex')
}

/** The zip holds one folder ("ffmpeg-9.0.2-essentials_build") with the binaries in bin/. */
async function findBinFolder(unzipped: string): Promise<string> {
  for (const entry of await readdir(unzipped, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const bin = join(unzipped, entry.name, 'bin')
    try {
      await Promise.all(BINARIES.map((name) => access(join(bin, name))))
      return bin
    } catch {
      // Not this folder.
    }
  }
  throw new Error(getT().ffmpeg.zipIncomplete)
}

interface InstallOptions {
  fetchUrl: FetchUrl
  /** Clipea2's own ffmpeg folder: each version goes to a subfolder named after it. */
  installRoot: string
  onProgress: (progress: FfmpegInstallProgress) => void
}

/**
 * Downloads the latest essentials build, checks its SHA-256 and leaves ffmpeg.exe and ffprobe.exe
 * in `installRoot/<version>/`. Returns that folder. Uses Windows' own tar to unzip.
 */
export async function installFfmpeg({ fetchUrl, installRoot, onProgress }: InstallOptions): Promise<string> {
  const version = await fetchLatestFfmpegVersion(fetchUrl)
  const expected = (await fetchText(fetchUrl, FFMPEG_RELEASE.sha256, getT().ffmpeg.checksumFailed)).split(/\s+/)[0].toLowerCase()
  const work = join(installRoot, WORK_DIR)
  await rm(work, { recursive: true, force: true })
  await mkdir(join(work, 'unzip'), { recursive: true })
  try {
    const zip = join(work, 'ffmpeg.zip')
    const actual = await download(fetchUrl, zip, onProgress)
    if (!/^[0-9a-f]{64}$/.test(expected) || actual !== expected) {
      throw new Error(getT().ffmpeg.corrupted)
    }

    onProgress({ stage: 'extracting' })
    const tar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
    // Only the two binaries: the rest of the zip (ffplay, docs) is never used.
    const patterns = BINARIES.map((name) => `*/bin/${name}`)
    const { code, stderr } = await runProcess(tar, ['-xf', zip, '-C', join(work, 'unzip'), ...patterns], { timeoutMs: 180_000 })
    if (code !== 0) throw new Error(getT().ffmpeg.unzipFailed(stderr.trim() || getT().ffmpeg.tarExit(code)))
    const bin = await findBinFolder(join(work, 'unzip'))

    const target = join(installRoot, version)
    await rm(target, { recursive: true, force: true })
    await mkdir(target, { recursive: true })
    for (const name of BINARIES) await rename(join(bin, name), join(target, name))
    return target
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => undefined)
  }
}

/** The newest version folder Clipea2 installed, or null if it never installed one. */
export async function installedFfmpegDir(installRoot: string): Promise<string | null> {
  const folders = await readdir(installRoot).catch(() => [])
  const newest = newestRelease(folders)
  return newest ? join(installRoot, newest) : null
}

/** Deletes older installs. One still running (an export in progress) stays until the next update. */
export async function removeOtherFfmpegVersions(installRoot: string, keep: string): Promise<void> {
  const folders = await readdir(installRoot).catch(() => [])
  await Promise.all(
    folders
      .filter((name) => /^\d+(?:\.\d+)*$/.test(name) && join(installRoot, name) !== keep)
      .map((name) => rm(join(installRoot, name), { recursive: true, force: true }).catch(() => undefined))
  )
}
