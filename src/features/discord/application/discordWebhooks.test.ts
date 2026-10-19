import { describe, expect, it } from 'vitest'
import { HttpWebhookApi } from '../infrastructure/discordWebhookApi'
import { DiscordWebhooks, isWebhookUrl, MAX_POST_BYTES, WebhookGoneError, type SavedWebhook, type WebhookApi } from './discordWebhooks'

const URL_CLIPS = 'https://discord.com/api/webhooks/000000000000000000/token-de-prueba-no-es-real-0000'
const target = { guildId: '111111111111111111', guildName: 'Amigos', channelId: '222222222222222222', channelName: 'clips' }

function memoryStore(initial: SavedWebhook[] = []) {
  let saved = [...initial]
  return {
    list: async () => saved,
    save: async (webhook: SavedWebhook) => {
      saved = [...saved.filter((item) => item.channelId !== webhook.channelId), webhook]
    },
    remove: async (channelId: string) => {
      saved = saved.filter((item) => item.channelId !== channelId)
    }
  }
}

function fakeApi(overrides: Partial<WebhookApi> = {}) {
  const posts: Array<{ url: string; filePath: string; identity: unknown }> = []
  const api: WebhookApi = {
    inspect: async () => ({ guildId: target.guildId, channelId: target.channelId, name: 'Clipea2' }),
    post: async (url, filePath, identity) => {
      posts.push({ url, filePath, identity })
      return { messageId: '999' }
    },
    ...overrides
  }
  return { api, posts }
}

describe('DiscordWebhooks', () => {
  it('saves a webhook only for the channel it really posts in, and never hands out the URL', async () => {
    const store = memoryStore()
    const hooks = new DiscordWebhooks(store, fakeApi().api, async () => 1000)
    expect(await hooks.add(target, ` ${URL_CLIPS} `)).toEqual([target])
    expect((await store.list())[0].url).toBe(URL_CLIPS)

    const wrong = new DiscordWebhooks(memoryStore(), fakeApi({ inspect: async () => ({ guildId: null, channelId: '333333333333333333', name: '' }) }).api, async () => 1)
    await expect(wrong.add(target, URL_CLIPS)).rejects.toThrow('otro canal')
    await expect(hooks.add(target, 'https://example.com/hook')).rejects.toThrow('webhook')
  })

  it('adds a channel from the URL alone, named by the user or after the webhook', async () => {
    const store = memoryStore()
    const hooks = new DiscordWebhooks(store, fakeApi().api, async () => 1)
    expect(await hooks.addByUrl(URL_CLIPS, '  Amigos #clips ')).toEqual([
      { guildId: target.guildId, guildName: 'Amigos #clips', channelId: target.channelId, channelName: '' }
    ])
    expect((await hooks.addByUrl(URL_CLIPS, ''))[0].guildName).toBe('Clipea2')
    expect(await store.list()).toHaveLength(1)
  })

  it('posts the clip with the user name and avatar', async () => {
    const { api, posts } = fakeApi()
    const hooks = new DiscordWebhooks(memoryStore([{ ...target, url: URL_CLIPS }]), api, async () => 5_000_000)
    const identity = { name: 'QKCHAMP', avatarUrl: 'https://cdn.discordapp.com/avatars/1/a.png' }
    expect(await hooks.send(target.channelId, 'C:/clips/gol.mp4', identity)).toEqual({ guildId: target.guildId, channelId: target.channelId, messageId: '999' })
    expect(posts).toEqual([{ url: URL_CLIPS, filePath: 'C:/clips/gol.mp4', identity }])
  })

  it('refuses clips Discord would reject and forgets deleted webhooks', async () => {
    const big = new DiscordWebhooks(memoryStore([{ ...target, url: URL_CLIPS }]), fakeApi().api, async () => MAX_POST_BYTES + 1)
    await expect(big.send(target.channelId, 'x.mp4', null)).rejects.toThrow('25 MB')

    const store = memoryStore([{ ...target, url: URL_CLIPS }])
    const gone = new DiscordWebhooks(store, fakeApi({ post: async () => Promise.reject(new WebhookGoneError('borrado')) }).api, async () => 1)
    await expect(gone.send(target.channelId, 'x.mp4', null)).rejects.toThrow('borrado')
    expect(await store.list()).toEqual([])
  })

  it('recognises webhook URLs', () => {
    expect(isWebhookUrl(URL_CLIPS)).toBe(true)
    expect(isWebhookUrl('https://canary.discord.com/api/v10/webhooks/000000000000000000/token-de-prueba-no-es-real-0000')).toBe(true)
    expect(isWebhookUrl('https://evil.com/api/webhooks/000000000000000000/token-de-prueba-no-es-real-0000')).toBe(false)
  })
})

describe('HttpWebhookApi', () => {
  it('uploads like a normal message with a file and waits for the message', async () => {
    let request: { url: string; body: FormData } | null = null
    const fakeFetch = (async (url: string, init: RequestInit) => {
      request = { url, body: init.body as FormData }
      return new Response(JSON.stringify({ id: '777' }), { status: 200 })
    }) as unknown as typeof fetch
    const api = new HttpWebhookApi(fakeFetch, async () => new Blob(['video'], { type: 'video/mp4' }))
    const result = await api.post(URL_CLIPS, 'C:\\clips\\gol final.mp4', { name: 'QKCHAMP', avatarUrl: null })

    expect(result).toEqual({ messageId: '777' })
    expect(request!.url).toBe(`${URL_CLIPS}?wait=true`)
    expect(JSON.parse(request!.body.get('payload_json') as string)).toEqual({
      username: 'QKCHAMP',
      allowed_mentions: { parse: [] },
      attachments: [{ id: 0, filename: 'gol final.mp4' }]
    })
    expect((request!.body.get('files[0]') as File).name).toBe('gol final.mp4')
  })

  it('turns a deleted webhook into WebhookGoneError', async () => {
    const fakeFetch = (async () => new Response('{}', { status: 404 })) as unknown as typeof fetch
    await expect(new HttpWebhookApi(fakeFetch).inspect(URL_CLIPS)).rejects.toBeInstanceOf(WebhookGoneError)
  })
})
