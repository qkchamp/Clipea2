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
    replace: async (channelId: string, webhook: SavedWebhook) => {
      saved = saved.filter((item) => item.channelId === channelId || item.channelId !== webhook.channelId).map((item) => (item.channelId === channelId ? webhook : item))
    },
    remove: async (channelId: string) => {
      saved = saved.filter((item) => item.channelId !== channelId)
    }
  }
}

function fakeApi(overrides: Partial<WebhookApi> = {}) {
  const posts: Array<{ url: string; filePath: string }> = []
  const api: WebhookApi = {
    inspect: async () => ({ guildId: target.guildId, channelId: target.channelId, name: 'Clipea2' }),
    post: async (url, filePath) => {
      posts.push({ url, filePath })
      return { messageId: '999' }
    },
    ...overrides
  }
  return { api, posts }
}

describe('DiscordWebhooks', () => {
  it('adds a channel from the URL alone, named by the user or after the webhook, and never hands out the URL', async () => {
    const store = memoryStore()
    const hooks = new DiscordWebhooks(store, fakeApi().api, async () => 1)
    expect(await hooks.addByUrl(` ${URL_CLIPS} `, '  Amigos #clips ')).toEqual([
      { guildId: target.guildId, guildName: 'Amigos #clips', channelId: target.channelId, channelName: '' }
    ])
    expect((await store.list())[0].url).toBe(URL_CLIPS)
    expect((await hooks.addByUrl(URL_CLIPS, ''))[0].guildName).toBe('Clipea2')
    expect(await store.list()).toHaveLength(1)
    await expect(hooks.addByUrl('https://example.com/hook', '')).rejects.toThrow('webhook')
  })

  it('posts the clip through the saved webhook', async () => {
    const { api, posts } = fakeApi()
    const hooks = new DiscordWebhooks(memoryStore([{ ...target, url: URL_CLIPS }]), api, async () => 5_000_000)
    expect(await hooks.send(target.channelId, 'C:/clips/gol.mp4')).toEqual({ guildId: target.guildId, channelId: target.channelId, messageId: '999' })
    expect(posts).toEqual([{ url: URL_CLIPS, filePath: 'C:/clips/gol.mp4' }])
  })

  it('refuses clips Discord would reject and keeps deleted webhooks listed to fix them with Editar', async () => {
    const big = new DiscordWebhooks(memoryStore([{ ...target, url: URL_CLIPS }]), fakeApi().api, async () => MAX_POST_BYTES + 1)
    await expect(big.send(target.channelId, 'x.mp4')).rejects.toThrow('25 MB')

    const store = memoryStore([{ ...target, url: URL_CLIPS }])
    const gone = new DiscordWebhooks(store, fakeApi({ post: async () => Promise.reject(new WebhookGoneError('borrado')) }).api, async () => 1)
    await expect(gone.send(target.channelId, 'x.mp4')).rejects.toThrow('tocá Editar')
    expect(await store.list()).toEqual([{ ...target, url: URL_CLIPS }])
  })

  it('edits a channel in its place: a new URL, a new name or both', async () => {
    const URL_NEW = 'https://discord.com/api/webhooks/000000000000000000/token-de-prueba-nuevo-no-es-real'
    const other = { guildId: target.guildId, guildName: 'Otro', channelId: '444444444444444444', channelName: '', url: URL_CLIPS }
    const store = memoryStore([{ ...target, url: URL_CLIPS }, other])
    const hooks = new DiscordWebhooks(store, fakeApi().api, async () => 1)

    // Same channel, new webhook: the name typed stays, the entry keeps its place.
    expect(await hooks.edit(target.channelId, ` ${URL_NEW} `, 'Amigos #clips')).toEqual([
      { guildId: target.guildId, guildName: 'Amigos #clips', channelId: target.channelId, channelName: '' },
      { guildId: other.guildId, guildName: 'Otro', channelId: other.channelId, channelName: '' }
    ])
    expect((await store.list())[0].url).toBe(URL_NEW)

    // Only the name: the URL is not touched and Discord is not asked.
    const offline = new DiscordWebhooks(store, fakeApi({ inspect: async () => Promise.reject(new Error('sin red')) }).api, async () => 1)
    expect((await offline.edit(target.channelId, '', ' Clips '))[0].guildName).toBe('Clips')
    expect((await store.list())[0].url).toBe(URL_NEW)

    // A new URL and no name: the webhook's own name.
    expect((await hooks.edit(target.channelId, URL_CLIPS, ''))[0].guildName).toBe('Clipea2')

    await expect(hooks.edit(target.channelId, 'https://example.com/hook', '')).rejects.toThrow('webhook')
    await expect(hooks.edit('555555555555555555', URL_CLIPS, '')).rejects.toThrow('ya no está')
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
    const result = await api.post(URL_CLIPS, 'C:\\clips\\gol final.mp4')

    expect(result).toEqual({ messageId: '777' })
    expect(request!.url).toBe(`${URL_CLIPS}?wait=true`)
    // No username or avatar: it posts with the webhook's own, set in Discord.
    expect(JSON.parse(request!.body.get('payload_json') as string)).toEqual({
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
