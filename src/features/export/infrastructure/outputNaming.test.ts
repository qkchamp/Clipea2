import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { partialOutputPath, sanitizeFileName, uniqueOutputPath } from './outputNaming'

describe('sanitizeFileName', () => {
  it('removes characters Windows does not allow', () => {
    expect(sanitizeFileName('How To Fish: el pez? <épico>')).toBe('How To Fish el pez épico')
  })

  it('drops the extension and trailing dots', () => {
    expect(sanitizeFileName('clip final...mp4')).toBe('clip final')
    expect(sanitizeFileName('Crash juego.mp4')).toBe('Crash juego')
  })

  it('falls back to a default name', () => {
    expect(sanitizeFileName(' ?? ')).toBe('clip')
  })
})

describe('uniqueOutputPath', () => {
  it('numbers copies instead of overwriting', () => {
    const taken = new Set([join('out', 'clip.mp4'), join('out', 'clip (2).mp4')])
    expect(uniqueOutputPath('out', 'clip', (path) => taken.has(path))).toBe(join('out', 'clip (3).mp4'))
  })
})

describe('partialOutputPath', () => {
  it('writes next to the final file with a name that is clearly unfinished', () => {
    expect(partialOutputPath('C:/out', 'golazo: final', '1234567890abcdef')).toBe(join('C:/out', 'golazo final.12345678.partial.mp4'))
  })
})
