import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { JsonWebhookStore, type SecretVault } from './jsonWebhookStore'

describe('JsonWebhookStore', () => {
  const dirs: string[] = []
  afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })))

  it('replaces a webhook in its place, sealed, one per channel', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'clipea2-webhooks-'))
    dirs.push(dir)
    const vault: SecretVault = {
      seal: (text) => Buffer.from(text).toString('base64').split('').reverse().join(''),
      open: (sealed) => Buffer.from(sealed.split('').reverse().join(''), 'base64').toString()
    }
    const file = join(dir, 'discord-webhooks.json')
    const store = new JsonWebhookStore(file, vault)
    const hook = (channelId: string, name: string) => ({
      guildId: '',
      guildName: name,
      channelId,
      channelName: '',
      url: `https://discord.com/api/webhooks/000000000000000000/token-de-prueba-${name}-no-es-real`
    })
    for (const saved of [hook('1', 'a'), hook('2', 'b'), hook('3', 'c')]) await store.save(saved)

    await store.replace('1', hook('1', 'nuevo'))
    expect((await store.list()).map((saved) => saved.guildName)).toEqual(['nuevo', 'b', 'c'])
    // Moved to a channel already listed: that older entry goes, the edited one keeps its place.
    await store.replace('2', hook('3', 'movido'))
    expect((await store.list()).map((saved) => [saved.channelId, saved.guildName])).toEqual([
      ['1', 'nuevo'],
      ['3', 'movido']
    ])
    expect(readFileSync(file, 'utf8')).not.toContain('token-de-prueba')
  })
})
