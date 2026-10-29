import { AtomicJsonFile } from '@shared/infrastructure/atomicJsonFile'
import type { SavedWebhook, WebhookStore } from '../application/discordWebhooks'

/** Encrypts secrets for this Windows user (DPAPI through Electron's safeStorage). */
export interface SecretVault {
  seal(text: string): string
  open(sealed: string): string
}

type StoredWebhook = Omit<SavedWebhook, 'url'> & { url: string }

/** userData/discord-webhooks.json: one webhook per channel, URLs sealed for this Windows user. */
export class JsonWebhookStore implements WebhookStore {
  private readonly file: AtomicJsonFile

  constructor(
    filePath: string,
    private readonly vault: SecretVault
  ) {
    this.file = new AtomicJsonFile(filePath, 2)
  }

  async list(): Promise<SavedWebhook[]> {
    const stored = await this.file.read()
    if (!Array.isArray(stored)) return []
    return (stored as StoredWebhook[]).flatMap((webhook) => {
      try {
        return [{ ...webhook, url: this.vault.open(webhook.url) }]
      } catch {
        return []
      }
    })
  }

  async save(webhook: SavedWebhook): Promise<void> {
    const others = (await this.list()).filter((saved) => saved.channelId !== webhook.channelId)
    await this.write([...others, webhook])
  }

  async replace(channelId: string, webhook: SavedWebhook): Promise<void> {
    // Still one webhook per channel: another entry already on the new channel goes away.
    const kept = (await this.list()).filter((saved) => saved.channelId === channelId || saved.channelId !== webhook.channelId)
    await this.write(kept.map((saved) => (saved.channelId === channelId ? webhook : saved)))
  }

  async remove(channelId: string): Promise<void> {
    await this.write((await this.list()).filter((saved) => saved.channelId !== channelId))
  }

  private write(webhooks: SavedWebhook[]): Promise<void> {
    return this.file.write(webhooks.map((webhook): StoredWebhook => ({ ...webhook, url: this.vault.seal(webhook.url) })))
  }
}
