import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

/** Before the rename the app was "Clipardo", and so was its profile folder. */
const LEGACY_NAME = 'Clipardo'

/**
 * The app's own files plus Chromium's "Local State", which holds the key that decrypts the Discord
 * secrets. Caches are left behind: they rebuild themselves.
 */
const CARRIED = ['settings.json', 'history.json', 'session.json', 'discord.json', 'discord-webhooks.json', 'Local State']

/**
 * First start after the rename: copies settings, history, session and Discord webhooks from the
 * old profile. Runs before Chromium starts, so the copied key is the one it loads. The old folder
 * is left untouched.
 */
export function migrateLegacyProfile(appDataDir: string, userDataDir: string): boolean {
  const legacy = join(appDataDir, LEGACY_NAME)
  const started = existsSync(join(userDataDir, 'settings.json')) || existsSync(join(userDataDir, 'Local State'))
  if (legacy.toLowerCase() === userDataDir.toLowerCase() || started || !existsSync(join(legacy, 'settings.json'))) return false
  mkdirSync(userDataDir, { recursive: true })
  for (const name of CARRIED) {
    const from = join(legacy, name)
    if (existsSync(from)) cpSync(from, join(userDataDir, name))
  }
  return true
}
