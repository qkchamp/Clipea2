import { rm } from 'node:fs/promises'
import { AtomicJsonFile } from '@shared/infrastructure/atomicJsonFile'
import type { DiscordAccount, DiscordAccountStore, DiscordTokens } from '../application/discordSession'
import type { PostIdentity } from '../application/discordWebhooks'

/** Encrypts secrets for this Windows user (DPAPI through Electron's safeStorage). */
export interface SecretVault {
  seal(text: string): string
  open(sealed: string): string
}

interface StoredAccount {
  clientId: string
  /** Sealed: the client secret and the tokens never reach the disk in clear text. */
  secret: string
  tokens: string | null
  /** Public name and avatar URL: not secret. */
  identity?: PostIdentity | null
}

/** userData/discord.json: the Discord app credentials and the user's tokens. */
export class JsonDiscordAccountStore implements DiscordAccountStore {
  private readonly file: AtomicJsonFile

  constructor(
    private readonly filePath: string,
    private readonly vault: SecretVault
  ) {
    this.file = new AtomicJsonFile(filePath, 2)
  }

  async load(): Promise<DiscordAccount | null> {
    const stored = (await this.file.read()) as Partial<StoredAccount> | null
    if (!stored || typeof stored.clientId !== 'string' || typeof stored.secret !== 'string') return null
    try {
      const tokens = stored.tokens ? (JSON.parse(this.vault.open(stored.tokens)) as DiscordTokens) : null
      return { clientId: stored.clientId, clientSecret: this.vault.open(stored.secret), tokens, identity: stored.identity ?? null }
    } catch {
      // Sealed by another Windows user or a broken file: start over.
      return null
    }
  }

  async save(account: DiscordAccount): Promise<void> {
    const stored: StoredAccount = {
      clientId: account.clientId,
      secret: this.vault.seal(account.clientSecret),
      tokens: account.tokens ? this.vault.seal(JSON.stringify(account.tokens)) : null,
      identity: account.identity ?? null
    }
    await this.file.write(stored)
  }

  async clear(): Promise<void> {
    await this.file.flush()
    await rm(this.filePath, { force: true })
  }
}
