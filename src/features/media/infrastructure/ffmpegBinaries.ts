import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { runProcess } from './processRunner'

export interface FfmpegBinaries {
  ffmpeg: string
  ffprobe: string
  version: string
}

interface Candidate {
  ffmpeg: string
  ffprobe: string
}

async function findOnPath(name: string): Promise<string | null> {
  const finder = process.platform === 'win32' ? 'where.exe' : 'which'
  try {
    const { stdout, code } = await runProcess(finder, [name], { timeoutMs: 5000 })
    const first = stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean)
    return code === 0 && first ? first : null
  } catch {
    return null
  }
}

async function readVersion(ffmpeg: string): Promise<string | null> {
  try {
    const { stdout, code } = await runProcess(ffmpeg, ['-hide_banner', '-version'], { timeoutMs: 10_000 })
    if (code !== 0) return null
    return /ffmpeg version (\S+)/.exec(stdout)?.[1] ?? 'desconocida'
  } catch {
    return null
  }
}

/** Finds ffmpeg + ffprobe: user folder first, then PATH, then the usual winget/manual installs. */
export async function locateFfmpeg(preferredDir?: string | null): Promise<FfmpegBinaries | null> {
  const exe = process.platform === 'win32' ? '.exe' : ''
  const candidates: Candidate[] = []
  if (preferredDir) {
    candidates.push({ ffmpeg: join(preferredDir, `ffmpeg${exe}`), ffprobe: join(preferredDir, `ffprobe${exe}`) })
  }
  const [ffmpegOnPath, ffprobeOnPath] = await Promise.all([findOnPath('ffmpeg'), findOnPath('ffprobe')])
  if (ffmpegOnPath && ffprobeOnPath) candidates.push({ ffmpeg: ffmpegOnPath, ffprobe: ffprobeOnPath })
  if (process.env.LOCALAPPDATA) {
    const links = join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links')
    candidates.push({ ffmpeg: join(links, 'ffmpeg.exe'), ffprobe: join(links, 'ffprobe.exe') })
  }
  candidates.push({ ffmpeg: 'C:\\ffmpeg\\bin\\ffmpeg.exe', ffprobe: 'C:\\ffmpeg\\bin\\ffprobe.exe' })

  for (const candidate of candidates) {
    if (!existsSync(candidate.ffmpeg) || !existsSync(candidate.ffprobe)) continue
    const version = await readVersion(candidate.ffmpeg)
    if (version) return { ...candidate, version }
  }
  return null
}
