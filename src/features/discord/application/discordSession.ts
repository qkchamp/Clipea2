import { isSnowflake, textChannels, type DiscordChannel, type DiscordGuild, type DiscordStatus } from '../domain/discordTargets'
import type { PostIdentity } from './discordWebhooks'

export interface DiscordTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

export interface DiscordAccount {
  clientId: string
  clientSecret: string
  tokens: DiscordTokens | null
  /** Name and avatar of the user, kept so webhook posts look like theirs even with Discord closed. */
  identity?: PostIdentity | null
}

/** Driven port: where the app credentials and the user's tokens are kept (encrypted). */
export interface DiscordAccountStore {
  load(): Promise<DiscordAccount | null>
  save(account: DiscordAccount): Promise<void>
  clear(): Promise<void>
}

/** Driven port: an open RPC link with the Discord app running on this PC. */
export interface RpcConnection {
  request<T>(cmd: string, args: Record<string, unknown>, timeoutMs?: number): Promise<T>
  close(): void
  readonly closed: boolean
}

export interface DiscordPorts {
  accounts: DiscordAccountStore
  openRpc(clientId: string): Promise<RpcConnection>
  exchangeCode(account: DiscordAccount, code: string): Promise<DiscordTokens>
  refreshTokens(account: DiscordAccount, refreshToken: string): Promise<DiscordTokens>
  now(): number
}

/** Enough to list servers and channels; Discord offers no RPC scope to post as the user. */
export const RPC_SCOPES = ['rpc', 'identify']
/** The user approves Clipea2 in a Discord window; give them time. */
const AUTHORIZE_TIMEOUT_MS = 5 * 60_000
/** Tokens this close to expiring are refreshed first. */
const EXPIRY_MARGIN_MS = 60_000

interface AuthenticateResult {
  user?: { id?: string; username?: string; global_name?: string | null; avatar?: string | null }
}

/**
 * Reads the user's servers and text channels from the Discord app through its local RPC. The
 * first connection asks the user to approve Clipea2 inside Discord; later ones reuse the token.
 */
export class DiscordSession {
  private rpc: RpcConnection | null = null
  private userName: string | null = null

  constructor(private readonly ports: DiscordPorts) {}

  async status(): Promise<DiscordStatus> {
    const account = await this.ports.accounts.load()
    return { configured: account !== null, connected: this.isConnected(), userName: this.isConnected() ? this.userName : null }
  }

  async configure(clientId: string, clientSecret: string): Promise<DiscordStatus> {
    const id = clientId.trim()
    const secret = clientSecret.trim()
    if (!isSnowflake(id)) throw new Error('El Client ID son 17 a 20 números (Discord › tu aplicación › OAuth2).')
    if (secret.length < 16) throw new Error('Falta el Client Secret (Discord › tu aplicación › OAuth2 › Reset Secret).')
    this.disconnect()
    await this.ports.accounts.save({ clientId: id, clientSecret: secret, tokens: null })
    return this.status()
  }

  async connect(): Promise<DiscordStatus> {
    if (this.isConnected()) return this.status()
    const account = await this.ports.accounts.load()
    if (!account) throw new Error('Primero cargá el Client ID y el Client Secret de tu aplicación de Discord.')
    this.disconnect()
    const rpc = await this.ports.openRpc(account.clientId)
    try {
      let tokens = account.tokens
      if (tokens && tokens.expiresAt - EXPIRY_MARGIN_MS < this.ports.now()) {
        tokens = await this.ports.refreshTokens(account, tokens.refreshToken).catch(() => null)
      }
      let user = tokens ? await this.authenticate(rpc, tokens).catch(() => null) : null
      if (!user || !tokens) {
        const { code } = await rpc.request<{ code: string }>('AUTHORIZE', { client_id: account.clientId, scopes: RPC_SCOPES }, AUTHORIZE_TIMEOUT_MS)
        tokens = await this.ports.exchangeCode(account, code)
        user = await this.authenticate(rpc, tokens)
      }
      await this.ports.accounts.save({ ...account, tokens, identity: user })
      this.rpc = rpc
      this.userName = user.name
      return this.status()
    } catch (error) {
      rpc.close()
      throw error
    }
  }

  async guilds(): Promise<DiscordGuild[]> {
    const rpc = await this.connected()
    const { guilds } = await rpc.request<{ guilds: Array<{ id: string; name: string; icon_url?: string | null }> }>('GET_GUILDS', {})
    return guilds.map((guild) => ({ id: guild.id, name: guild.name, iconUrl: guild.icon_url ?? null }))
  }

  async textChannels(guildId: string): Promise<DiscordChannel[]> {
    const rpc = await this.connected()
    const { channels } = await rpc.request<{ channels: DiscordChannel[] }>('GET_CHANNELS', { guild_id: guildId })
    return textChannels(channels.map(({ id, name, type }) => ({ id, name, type })))
  }

  /** Last known name and avatar of the user (null before the first connection). */
  async identity(): Promise<PostIdentity | null> {
    return (await this.ports.accounts.load())?.identity ?? null
  }

  /** Forgets the app credentials and the user's tokens. */
  async forget(): Promise<void> {
    this.disconnect()
    await this.ports.accounts.clear()
  }

  disconnect(): void {
    this.rpc?.close()
    this.rpc = null
    this.userName = null
  }

  private isConnected(): boolean {
    return this.rpc !== null && !this.rpc.closed
  }

  private async connected(): Promise<RpcConnection> {
    if (!this.isConnected()) await this.connect()
    return this.rpc!
  }

  private async authenticate(rpc: RpcConnection, tokens: DiscordTokens): Promise<PostIdentity> {
    const { user } = await rpc.request<AuthenticateResult>('AUTHENTICATE', { access_token: tokens.accessToken })
    return {
      name: user?.global_name || user?.username || 'tu cuenta',
      avatarUrl: user?.id && user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : null
    }
  }
}
