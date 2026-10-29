import type { WebhookTarget } from '../domain/discordTargets'

export type { WebhookTarget }

export interface SavedWebhook extends WebhookTarget {
  url: string
}

/** Driven port: saved webhooks (their URLs are secrets: anyone with one can post). */
export interface WebhookStore {
  list(): Promise<SavedWebhook[]>
  save(webhook: SavedWebhook): Promise<void>
  /** Puts `webhook` where the one saved for `channelId` was, keeping its place in the list. */
  replace(channelId: string, webhook: SavedWebhook): Promise<void>
  remove(channelId: string): Promise<void>
}

/** Driven port: Discord's webhook endpoints. */
export interface WebhookApi {
  /** The channel the webhook posts in and its name in Discord (fails if the webhook was deleted). */
  inspect(url: string): Promise<{ guildId: string | null; channelId: string; name: string }>
  /** Posts as the webhook: the name and picture set for it in Discord. */
  post(url: string, filePath: string): Promise<{ messageId: string }>
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

  async addByUrl(url: string, label: string): Promise<WebhookTarget[]> {
    await this.store.save(await this.fromUrl(url, label))
    return this.targets()
  }

  /**
   * Fixes a saved channel in its place: a new URL (the old webhook broke) is checked like a new one,
   * an empty one keeps the current URL. With no name, a new URL brings the webhook's own.
   */
  async edit(channelId: string, url: string, label: string): Promise<WebhookTarget[]> {
    const current = (await this.store.list()).find((saved) => saved.channelId === channelId)
    if (!current) throw new Error('Ese canal ya no está en la lista.')
    const name = label.trim()
    const next = url.trim() ? await this.fromUrl(url, name) : name ? { ...current, guildName: name, channelName: '' } : current
    await this.store.replace(channelId, next)
    return this.targets()
  }

  async remove(channelId: string): Promise<WebhookTarget[]> {
    await this.store.remove(channelId)
    return this.targets()
  }

  async send(channelId: string, filePath: string): Promise<{ guildId: string; channelId: string; messageId: string }> {
    const webhook = (await this.store.list()).find((saved) => saved.channelId === channelId)
    if (!webhook) throw new Error('Ese canal todavía no tiene envío directo.')
    if ((await this.sizeOf(filePath)) > MAX_POST_BYTES) throw new Error('El clip pasa los 25 MB: Discord no lo acepta por webhook.')
    try {
      const { messageId } = await this.api.post(webhook.url, filePath)
      return { guildId: webhook.guildId, channelId, messageId }
    } catch (error) {
      // Deleted in Discord: the channel stays listed, so Editar takes the new URL and keeps its name.
      if (error instanceof WebhookGoneError) throw new WebhookGoneError('Ese webhook ya no existe en Discord: tocá Editar y pegá la URL de uno nuevo.')
      throw error
    }
  }

  /**
   * From the URL alone: Discord does not say the server or channel names, so the user's label (or
   * the webhook's own name) is what shows up in the list.
   */
  private async fromUrl(url: string, label: string): Promise<SavedWebhook> {
    const clean = url.trim()
    if (!isWebhookUrl(clean)) throw new Error('Eso no es la URL de un webhook (empieza con https://discord.com/api/webhooks/…).')
    const real = await this.api.inspect(clean)
    const name = label.trim() || real.name || 'Canal de Discord'
    return { guildId: real.guildId ?? '', guildName: name, channelId: real.channelId, channelName: '', url: clean }
  }
}
