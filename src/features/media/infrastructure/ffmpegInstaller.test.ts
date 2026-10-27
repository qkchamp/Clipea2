import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FFMPEG_RELEASE, type FfmpegInstallProgress } from '../domain/ffmpegRelease'
import { installedFfmpegDir, installFfmpeg, removeOtherFfmpegVersions, type FetchUrl } from './ffmpegInstaller'

const temps: string[] = []
const tempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'clipea2-ffmpeg-'))
  temps.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A zip shaped like gyan.dev's: one folder with the binaries (fake ones) in bin/. */
function fakeRelease(version: string): Buffer {
  const source = tempDir()
  const bin = join(source, `ffmpeg-${version}-essentials_build`, 'bin')
  mkdirSync(bin, { recursive: true })
  for (const name of ['ffmpeg.exe', 'ffprobe.exe', 'ffplay.exe']) writeFileSync(join(bin, name), `${name} ${version}`)
  const zip = join(source, 'release.zip')
  // Windows' own tar (bsdtar) writes zips; a GNU tar earlier in PATH would not.
  const tar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
  execFileSync(tar, ['-a', '-cf', zip, '-C', source, `ffmpeg-${version}-essentials_build`])
  return readFileSync(zip)
}

function fakeFetch(version: string, zip: Buffer, sha256 = createHash('sha256').update(zip).digest('hex')): FetchUrl {
  return async (url) => {
    if (url === FFMPEG_RELEASE.version) return new Response(`${version}\n`)
    if (url === FFMPEG_RELEASE.sha256) return new Response(`${sha256}\n`)
    if (url === FFMPEG_RELEASE.zip) return new Response(new Uint8Array(zip), { headers: { 'content-length': String(zip.length) } })
    return new Response('', { status: 404 })
  }
}

describe.runIf(process.platform === 'win32')('installFfmpeg', () => {
  it('leaves only ffmpeg and ffprobe in a folder named after the version', async () => {
    const root = tempDir()
    const progress: FfmpegInstallProgress[] = []
    const dir = await installFfmpeg({ fetchUrl: fakeFetch('9.9.9', fakeRelease('9.9.9')), installRoot: root, onProgress: (p) => progress.push(p) })

    expect(dir).toBe(join(root, '9.9.9'))
    expect(readdirSync(dir).sort()).toEqual(['ffmpeg.exe', 'ffprobe.exe'])
    expect(readFileSync(join(dir, 'ffmpeg.exe'), 'utf8')).toBe('ffmpeg.exe 9.9.9')
    // The download and the unzipped copy are gone.
    expect(readdirSync(root)).toEqual(['9.9.9'])
    expect(progress.at(-1)).toEqual({ stage: 'extracting' })
    expect(progress.some((p) => p.stage === 'downloading' && p.receivedBytes === p.totalBytes)).toBe(true)
  })

  it('refuses a download whose checksum does not match, and installs nothing', async () => {
    const root = tempDir()
    const fetchUrl = fakeFetch('9.9.9', fakeRelease('9.9.9'), '0'.repeat(64))
    await expect(installFfmpeg({ fetchUrl, installRoot: root, onProgress: () => undefined })).rejects.toThrow(/dañada/)
    expect(existsSync(join(root, '9.9.9'))).toBe(false)
    expect(readdirSync(root)).toEqual([])
  })
})

describe('installed ffmpeg folders', () => {
  it('uses the newest version and cleans up the older ones', async () => {
    const root = tempDir()
    for (const version of ['8.1.2', '9.0.2']) mkdirSync(join(root, version))
    writeFileSync(join(root, 'notas.txt'), 'no es una versión')

    const newest = await installedFfmpegDir(root)
    expect(newest).toBe(join(root, '9.0.2'))
    await removeOtherFfmpegVersions(root, newest!)
    expect(readdirSync(root).sort()).toEqual(['9.0.2', 'notas.txt'])
  })

  it('finds nothing when Clipea2 never installed ffmpeg', async () => {
    expect(await installedFfmpegDir(join(tempDir(), 'no-existe'))).toBeNull()
  })
})
