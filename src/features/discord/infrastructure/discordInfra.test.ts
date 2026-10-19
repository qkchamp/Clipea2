import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DISCORD_REDIRECT_URI, exchangeCode } from './discordOAuth'
import { JsonDiscordAccountStore, type SecretVault } from './jsonDiscordAccountStore'
import { encodeFrame, FrameReader, RpcOp } from './rpcFrames'

describe('rpc frames', () => {
  it('writes the header Discord expects: opcode and length, little-endian', () => {
    const frame = encodeFrame(RpcOp.handshake, { v: 1, client_id: '1' })
    expect(frame.readInt32LE(0)).toBe(0)
    expect(frame.readInt32LE(4)).toBe(frame.length - 8)
  })

  it('reassembles frames split across chunks and several in one chunk', () => {
    const a = encodeFrame(RpcOp.frame, { cmd: 'DISPATCH', evt: 'READY' })
    const b = encodeFrame(RpcOp.ping, { n: 1 })
    const both = Buffer.concat([a, b])
    const reader = new FrameReader()
    expect(reader.push(both.subarray(0, 5))).toEqual([])
    expect(reader.push(both.subarray(5, a.length + 3))).toEqual([{ op: 1, data: { cmd: 'DISPATCH', evt: 'READY' } }])
    expect(reader.push(both.subarray(a.length + 3))).toEqual([{ op: 3, data: { n: 1 } }])
  })
})

describe('exchangeCode', () => {
  const account = { clientId: '123456789012345678', clientSecret: 'secret', tokens: null }

  it('posts the standard OAuth2 form and keeps the expiry', async () => {
    let sent: URLSearchParams | null = null
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      sent = init.body as URLSearchParams
      return new Response(JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_in: 600 }), { status: 200 })
    }) as unknown as typeof fetch
    const tokens = await exchangeCode(account, 'the-code', 1000, fakeFetch)
    expect(tokens).toEqual({ accessToken: 'a', refreshToken: 'r', expiresAt: 601_000 })
    expect(Object.fromEntries(sent!)).toEqual({
      client_id: account.clientId,
      client_secret: 'secret',
      grant_type: 'authorization_code',
      code: 'the-code',
      redirect_uri: DISCORD_REDIRECT_URI
    })
  })

  it('explains a missing redirect in plain words', async () => {
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ error: 'invalid_request', error_description: 'Invalid "redirect_uri" in request.' }), {
        status: 400
      })) as unknown as typeof fetch
    await expect(exchangeCode(account, 'x', 0, fakeFetch)).rejects.toThrow(DISCORD_REDIRECT_URI)
  })
})

describe('JsonDiscordAccountStore', () => {
  const dirs: string[] = []
  afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })))

  it('never writes the secret or the tokens in clear text', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'clipea2-discord-'))
    dirs.push(dir)
    const vault: SecretVault = {
      seal: (text) => Buffer.from(text).toString('base64').split('').reverse().join(''),
      open: (sealed) => Buffer.from(sealed.split('').reverse().join(''), 'base64').toString()
    }
    const file = join(dir, 'discord.json')
    const store = new JsonDiscordAccountStore(file, vault)
    const account = { clientId: '123456789012345678', clientSecret: 'super-secret-value', tokens: { accessToken: 'access-value-123', refreshToken: 'refresh-value-456', expiresAt: 5 } }
    await store.save(account)

    const raw = readFileSync(file, 'utf8')
    expect(raw).not.toContain('super-secret-value')
    expect(raw).not.toContain('access-value-123')
    expect(raw).not.toContain('refresh-value-456')
    expect(await new JsonDiscordAccountStore(file, vault).load()).toEqual({ ...account, identity: null })

    await store.clear()
    expect(await store.load()).toBeNull()
  })
})
