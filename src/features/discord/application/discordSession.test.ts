import { describe, expect, it } from 'vitest'
import { channelLink, isSnowflake, textChannels } from '../domain/discordTargets'
import { DiscordSession, RPC_SCOPES, type DiscordAccount, type DiscordPorts, type DiscordTokens, type RpcConnection } from './discordSession'

const CLIENT_ID = '123456789012345678'
const SECRET = 'abcdefghijklmnopqrstuvwxyz012345'

function fakeRpc(responses: Record<string, (args: Record<string, unknown>) => unknown>) {
  const calls: Array<{ cmd: string; args: Record<string, unknown> }> = []
  const rpc: RpcConnection & { calls: typeof calls } = {
    calls,
    closed: false,
    async request<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
      calls.push({ cmd, args })
      const answer = responses[cmd]
      if (!answer) throw new Error(`sin respuesta para ${cmd}`)
      return answer(args) as T
    },
    close() {
      ;(rpc as { closed: boolean }).closed = true
    }
  }
  return rpc
}

function ports(account: DiscordAccount | null, rpc: RpcConnection, overrides: Partial<DiscordPorts> = {}) {
  let stored = account
  const saved: DiscordAccount[] = []
  const value: DiscordPorts = {
    accounts: {
      load: async () => stored,
      save: async (next) => {
        stored = next
        saved.push(next)
      },
      clear: async () => {
        stored = null
      }
    },
    openRpc: async () => rpc,
    exchangeCode: async (_account, code): Promise<DiscordTokens> => ({ accessToken: `token-${code}`, refreshToken: 'refresh', expiresAt: 10_000_000 }),
    refreshTokens: async (): Promise<DiscordTokens> => ({ accessToken: 'refreshed', refreshToken: 'refresh-2', expiresAt: 10_000_000 }),
    now: () => 1_000_000,
    ...overrides
  }
  return { ports: value, saved, stored: () => stored }
}

const servers = {
  AUTHENTICATE: () => ({ user: { id: '42', username: 'qk', global_name: 'QKCHAMP', avatar: 'abc' } }),
  GET_GUILDS: () => ({ guilds: [{ id: '1', name: 'Amigos', icon_url: null }] }),
  GET_CHANNELS: () => ({
    channels: [
      { id: '10', name: 'general', type: 0 },
      { id: '11', name: 'Charla', type: 2 },
      { id: '12', name: 'anuncios', type: 5 }
    ]
  })
}

describe('DiscordSession', () => {
  it('asks the user once in Discord, then lists servers and text channels only', async () => {
    const rpc = fakeRpc({ ...servers, AUTHORIZE: () => ({ code: 'abc' }) })
    const { ports: p, saved } = ports({ clientId: CLIENT_ID, clientSecret: SECRET, tokens: null }, rpc)
    const session = new DiscordSession(p)

    expect(await session.connect()).toEqual({ configured: true, connected: true, userName: 'QKCHAMP' })
    expect(rpc.calls[0]).toEqual({ cmd: 'AUTHORIZE', args: { client_id: CLIENT_ID, scopes: RPC_SCOPES } })
    expect(rpc.calls[1]).toEqual({ cmd: 'AUTHENTICATE', args: { access_token: 'token-abc' } })
    expect(saved.at(-1)?.tokens?.accessToken).toBe('token-abc')
    expect(await session.identity()).toEqual({ name: 'QKCHAMP', avatarUrl: 'https://cdn.discordapp.com/avatars/42/abc.png' })

    expect(await session.guilds()).toEqual([{ id: '1', name: 'Amigos', iconUrl: null }])
    expect((await session.textChannels('1')).map((channel) => channel.name)).toEqual(['general', 'anuncios'])
  })

  it('reuses a saved token without asking again', async () => {
    const rpc = fakeRpc(servers)
    const tokens = { accessToken: 'saved', refreshToken: 'r', expiresAt: 9_000_000 }
    const session = new DiscordSession(ports({ clientId: CLIENT_ID, clientSecret: SECRET, tokens }, rpc).ports)
    await session.connect()
    expect(rpc.calls.map((call) => call.cmd)).toEqual(['AUTHENTICATE'])
  })

  it('refreshes an expired token before using it', async () => {
    const rpc = fakeRpc(servers)
    const tokens = { accessToken: 'old', refreshToken: 'r', expiresAt: 1_000 }
    const session = new DiscordSession(ports({ clientId: CLIENT_ID, clientSecret: SECRET, tokens }, rpc).ports)
    await session.connect()
    expect(rpc.calls[0]).toEqual({ cmd: 'AUTHENTICATE', args: { access_token: 'refreshed' } })
  })

  it('closes the link when the user cancels in Discord', async () => {
    const rpc = fakeRpc({
      AUTHORIZE: () => {
        throw new Error('Se canceló la autorización en Discord.')
      }
    })
    const session = new DiscordSession(ports({ clientId: CLIENT_ID, clientSecret: SECRET, tokens: null }, rpc).ports)
    await expect(session.connect()).rejects.toThrow('Se canceló')
    expect(rpc.closed).toBe(true)
    expect((await session.status()).connected).toBe(false)
  })

  it('checks the credentials before saving them', async () => {
    const session = new DiscordSession(ports(null, fakeRpc({})).ports)
    await expect(session.configure('abc', SECRET)).rejects.toThrow('Client ID')
    await expect(session.configure(CLIENT_ID, 'corto')).rejects.toThrow('Client Secret')
    expect(await session.configure(` ${CLIENT_ID} `, SECRET)).toMatchObject({ configured: true, connected: false })
  })

  it('needs credentials to connect', async () => {
    await expect(new DiscordSession(ports(null, fakeRpc({})).ports).connect()).rejects.toThrow('Client ID')
  })
})

describe('discord targets', () => {
  it('keeps text and announcement channels', () => {
    expect(textChannels([{ id: '1', name: 'voz', type: 2 }, { id: '2', name: 'general', type: 0 }])).toEqual([
      { id: '2', name: 'general', type: 0 }
    ])
  })

  it('links straight to a channel in the app', () => {
    expect(channelLink('111', '222')).toBe('discord://-/channels/111/222')
    expect(isSnowflake('123456789012345678')).toBe(true)
    expect(isSnowflake('12; rm -rf')).toBe(false)
  })
})
