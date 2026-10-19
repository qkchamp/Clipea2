import { describe, expect, it } from 'vitest'
import { fromMediaUrl, toMediaUrl } from './mediaUrl'

describe('media URLs', () => {
  it('round-trips Windows paths with spaces and accents', () => {
    const path = 'C:\\Users\\me\\Videos\\NVIDIA\\How To Fish\\Clip ñandú #1.mp4'
    expect(fromMediaUrl(toMediaUrl(path))).toBe(path)
  })

  it('rejects other schemes', () => {
    expect(fromMediaUrl('https://example.com/a.mp4')).toBeNull()
    expect(fromMediaUrl('not a url')).toBeNull()
  })
})
