import type { PostIdentity, WebhookTarget } from '../domain/discordTargets'

export type { PostIdentity, WebhookTarget }

export interface SavedWebhook extends WebhookTarget {
  url: string
}

/** Driven port: saved webhooks (their URLs are secrets: anyone with one can post). */
export interface WebhookStore {
  list(): Promise<SavedWebhook[]>
  save(webhook: SavedWebhook): Promise<void>
  remove(channelId: string): Promise<void>
}

/** Driven port: Discord's webhook endpoints. */
export interface WebhookApi {
  /** The channel the webhook posts in and its name in Discord (fails if the webhook was deleted). */
  inspect(url: string): Promise<{ guildId: string | null; channelId: string; name: string }>
  post(url: string, filePath: string, identity: PostIdentity | null): Promise<{ messageId: string }>
}

export class WebhookGoneError extends Error {}

/** Discord rejects any message request over 25 MiB. */
export const MAX_POST_BYTES = 25 * 1024 * 1024

const WEBHOOK_URL = /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks\/(\d{17,20})\/([\w-]{20,})\/?$/

export function isWebhookUrl(url: string): boolean {
  return WEBHOOK_URL.test(url.trim())
}

/** Sends clips to text channels through webhooks: no Ctrl+V, and it works with Discord closed. */
export class DiscordWebhooks {
  constructor(
    private readonly store: WebhookStore,
    private readonly api: WebhookApi,
    private readonly sizeOf: (path: string) => Promise<number>
  ) {}

  async targets(): Promise<WebhookTarget[]> {
    return (await this.store.list()).map(({ url: _url, ...target }) => target)
  }

  /** Checks the webhook really belongs to the channel picked, then keeps it. */
  async add(target: WebhookTarget, url: string): Promise<WebhookTarget[]> {
    const clean = url.trim()
    if (!isWebhookUrl(clean)) throw new Error('Eso no es la URL de un webhook (empieza con https://discord.com/api/webhooks/…).')
    const real = await this.api.inspect(clean)
    if (real.channelId !== target.channelId) throw new Error(`Ese webhook publica en otro canal, no en #${target.channelName}.`)
    await this.store.save({ ...target, url: clean })
    return this.targets()
  }

  /**
   * Just the URL, no Discord app linked: Discord does not say the server or channel names, so the
   * user's label (or the webhook's own name) is what shows up in the list.
   */
  async addByUrl(url: string, label: string): Promise<WebhookTarget[]> {
    const clean = url.trim()
    if (!isWebhookUrl(clean)) throw new Error('Eso no es la URL de un webhook (empieza con https://discord.com/api/webhooks/…).')
    const real = await this.api.inspect(clean)
    const name = label.trim() || real.name || 'Canal de Discord'
    await this.store.save({ guildId: real.guildId ?? '', guildName: name, channelId: real.channelId, channelName: '', url: clean })
    return this.targets()
  }

  async remove(channelId: string): Promise<WebhookTarget[]> {
    await this.store.remove(channelId)
    return this.targets()
  }

  async send(channelId: string, filePath: string, identity: PostIdentity | null): Promise<{ guildId: string; channelId: string; messageId: string }> {
    const webhook = (await this.store.list()).find((saved) => saved.channelId === channelId)
    if (!webhook) throw new Error('Ese canal todavía no tiene envío directo.')
    if ((await this.sizeOf(filePath)) > MAX_POST_BYTES) throw new Error('El clip pasa los 25 MB: Discord no lo acepta por webhook.')
    try {
      const { messageId } = await this.api.post(webhook.url, filePath, identity)
      return { guildId: webhook.guildId, channelId, messageId }
    } catch (error) {
      // Deleted in Discord: forget it so the channel asks for a new one.
      if (error instanceof WebhookGoneError) await this.store.remove(channelId)
      throw error
    }
  }
}
