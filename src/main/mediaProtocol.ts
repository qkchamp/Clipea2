import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { Readable } from 'node:stream'
import { protocol } from 'electron'
import { MEDIA_SCHEME, fromMediaUrl } from '@shared/contracts/mediaUrl'
import { parseRange } from './httpRange'

const MIME_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png'
}

/** Must run before the app is ready. */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
  ])
}

const toWeb = (stream: Readable): ReadableStream => Readable.toWeb(stream) as unknown as ReadableStream

/** 1 MiB reads: 16x fewer disk reads and stream chunks than Node's 64 KiB default (HDDs like long reads). */
const VIDEO_CHUNK = 1024 * 1024
const IMAGES = new Set(['.jpg', '.jpeg', '.png'])

/** Serves local videos and thumbnails with Range support so the player can seek instantly. */
export function handleMediaProtocol(): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    const filePath = fromMediaUrl(request.url)
    const mime = filePath ? MIME_TYPES[extname(filePath).toLowerCase()] : undefined
    if (!filePath || !mime) return new Response('Not found', { status: 404 })

    const size = await stat(filePath)
      .then((info) => info.size)
      .catch(() => null)
    if (size === null) return new Response('Not found', { status: 404 })

    const isImage = IMAGES.has(extname(filePath).toLowerCase())
    // Previews are named after a hash of the video and never change: the page may keep them in memory.
    const cache = isImage ? 'public, max-age=31536000, immutable' : 'no-cache'
    const headers = { 'Content-Type': mime, 'Accept-Ranges': 'bytes', 'Cache-Control': cache }
    const chunk = isImage ? undefined : VIDEO_CHUNK
    const range = parseRange(request.headers.get('range'), size)
    if (range === 'invalid') {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
    }
    if (range) {
      return new Response(toWeb(createReadStream(filePath, { start: range.start, end: range.end, highWaterMark: chunk })), {
        status: 206,
        headers: {
          ...headers,
          'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
          'Content-Length': String(range.end - range.start + 1)
        }
      })
    }
    return new Response(toWeb(createReadStream(filePath, { highWaterMark: chunk })), {
      status: 200,
      headers: { ...headers, 'Content-Length': String(size) }
    })
  })
}
