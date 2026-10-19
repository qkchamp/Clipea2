/** Local files reach the renderer through this scheme (range-aware, so the player can seek). */
export const MEDIA_SCHEME = 'clipea2-media'

export function toMediaUrl(filePath: string): string {
  return `${MEDIA_SCHEME}://local/${encodeURIComponent(filePath)}`
}

export function fromMediaUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== `${MEDIA_SCHEME}:`) return null
    return decodeURIComponent(parsed.pathname.replace(/^\//, ''))
  } catch {
    return null
  }
}
