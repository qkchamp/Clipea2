import { openAsBlob } from 'node:fs'
import { basename } from 'node:path'
import { WebhookGoneError, type PostIdentity, type WebhookApi } from '../application/discordWebhooks'

interface DiscordError {
  message?: string
  retry_after?: number
}

async function failure(response: Response): Promise<Error> {
  const body = (await response.json().catch(() => ({}))) as DiscordError
  if (response.status === 404 || response.status === 401) return new WebhookGoneError('Ese webhook ya no existe en Discord: pegá uno nuevo.')
  if (response.status === 413) return new Error('Discord rechazó el clip por tamaño: el límite de ese servidor es más chico.')
  if (response.status === 429) return new Error(`Discord pide esperar ${Math.ceil(body.retry_after ?? 1)} s antes de enviar otro.`)
  return new Error(body.message ? `Discord: ${body.message}` : `Discord respondió ${response.status}.`)
}

/** Discord's webhook endpoints over HTTPS (multipart upload, like a normal message with a file). */
export class HttpWebhookApi implements WebhookApi {
  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly readFile: (path: string) => Promise<Blob> = (path) => openAsBlob(path, { type: 'video/mp4' })
  ) {}

  async inspect(url: string): Promise<{ guildId: string | null; channelId: string; name: string }> {
    const response = await this.fetchImpl(url.trim())
    if (!response.ok) throw await failure(response)
    const webhook = (await response.json()) as { guild_id?: string | null; channel_id?: string; name?: string | null }
    if (!webhook.channel_id) throw new Error('Discord no devolvió el canal de ese webhook.')
    return { guildId: webhook.guild_id ?? null, channelId: webhook.channel_id, name: webhook.name ?? '' }
  }

  async post(url: string, filePath: string, identity: PostIdentity | null): Promise<{ messageId: string }> {
    const fileName = basename(filePath)
    const form = new FormData()
    form.append(
      'payload_json',
      JSON.stringify({
        ...(identity ? { username: identity.name.slice(0, 80) } : {}),
        ...(identity?.avatarUrl ? { avatar_url: identity.avatarUrl } : {}),
        allowed_mentions: { parse: [] },
        attachments: [{ id: 0, filename: fileName }]
      })
    )
    form.append('files[0]', await this.readFile(filePath), fileName)
    // wait=true: Discord answers with the message, so the post can be confirmed.
    const response = await this.fetchImpl(`${url.trim().replace(/\/$/, '')}?wait=true`, { method: 'POST', body: form })
    if (!response.ok) throw await failure(response)
    const message = (await response.json()) as { id?: string }
    return { messageId: message.id ?? '' }
  }
}
