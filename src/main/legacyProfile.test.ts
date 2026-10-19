import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { migrateLegacyProfile } from './legacyProfile'

const dirs: string[] = []
const appData = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'clipea2-appdata-'))
  dirs.push(dir)
  return dir
}
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })))

describe('migrateLegacyProfile', () => {
  it('brings the old profile over once, key included, and leaves the old one as it was', () => {
    const root = appData()
    const legacy = join(root, 'Clipardo')
    mkdirSync(join(legacy, 'cache'), { recursive: true })
    for (const name of ['settings.json', 'history.json', 'discord-webhooks.json', 'Local State']) writeFileSync(join(legacy, name), name)
    const target = join(root, 'Clipea2')

    expect(migrateLegacyProfile(root, target)).toBe(true)
    expect(readFileSync(join(target, 'Local State'), 'utf8')).toBe('Local State')
    expect(readFileSync(join(target, 'discord-webhooks.json'), 'utf8')).toBe('discord-webhooks.json')
    expect(existsSync(join(target, 'cache'))).toBe(false)
    expect(existsSync(join(legacy, 'settings.json'))).toBe(true)

    // Second start: the new profile is already in use.
    writeFileSync(join(target, 'settings.json'), 'nuevo')
    expect(migrateLegacyProfile(root, target)).toBe(false)
    expect(readFileSync(join(target, 'settings.json'), 'utf8')).toBe('nuevo')
  })

  it('does nothing without an old profile', () => {
    const root = appData()
    expect(migrateLegacyProfile(root, join(root, 'Clipea2'))).toBe(false)
    expect(existsSync(join(root, 'Clipea2'))).toBe(false)
  })
})
