import type { DiscordAccount, DiscordTokens } from '../application/discordSession'

const TOKEN_URL = 'https://discord.com/api/oauth2/token'
/** Must also be listed in the Discord app (OAuth2 › Redirects): the token exchange checks it. */
export const DISCORD_REDIRECT_URI = 'http://127.0.0.1'

interface TokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

async function requestTokens(body: Record<string, string>, now: number, fetchImpl: typeof fetch): Promise<DiscordTokens> {
  const response = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body)
  })
  const json = (await response.json().catch(() => ({}))) as TokenResponse
  if (!response.ok || !json.access_token || !json.refresh_token) {
    if (json.error === 'invalid_client') throw new Error('Discord rechazó el Client Secret: generalo de nuevo y cargalo.')
    if (json.error === 'invalid_request' && /redirect/i.test(json.error_description ?? '')) {
      throw new Error(`Agregá ${DISCORD_REDIRECT_URI} en tu aplicación de Discord (OAuth2 › Redirects).`)
    }
    throw new Error(json.error_description || json.error || `Discord respondió ${response.status} al pedir el permiso.`)
  }
  return { accessToken: json.access_token, refreshToken: json.refresh_token, expiresAt: now + (json.expires_in ?? 0) * 1000 }
}

/** Trades the code Discord gave after the user approved Clipea2 for an access token. */
export function exchangeCode(account: DiscordAccount, code: string, now = Date.now(), fetchImpl: typeof fetch = fetch): Promise<DiscordTokens> {
  return requestTokens(
    {
      client_id: account.clientId,
      client_secret: account.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: DISCORD_REDIRECT_URI
    },
    now,
    fetchImpl
  )
}

export function refreshTokens(
  account: DiscordAccount,
  refreshToken: string,
  now = Date.now(),
  fetchImpl: typeof fetch = fetch
): Promise<DiscordTokens> {
  return requestTokens(
    { client_id: account.clientId, client_secret: account.clientSecret, grant_type: 'refresh_token', refresh_token: refreshToken },
    now,
    fetchImpl
  )
}
