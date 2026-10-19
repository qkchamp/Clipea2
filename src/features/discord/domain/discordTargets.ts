export interface DiscordGuild {
  id: string
  name: string
  iconUrl: string | null
}

export interface DiscordChannel {
  id: string
  name: string
  type: number
}

/** A channel with direct sending; the webhook URL itself never leaves the main process. */
export interface WebhookTarget {
  guildId: string
  guildName: string
  channelId: string
  channelName: string
}

/** How a post shows up: the user's Discord name and avatar instead of the webhook's. */
export interface PostIdentity {
  name: string
  avatarUrl: string | null
}

export interface DiscordStatus {
  /** Client ID and secret saved. */
  configured: boolean
  /** Linked to the Discord app on this PC and authorized. */
  connected: boolean
  userName: string | null
}

/** Guild text (0) and announcement (5) channels: the ones a clip can be posted in. */
const TEXT_CHANNEL_TYPES = new Set([0, 5])

export function textChannels(channels: readonly DiscordChannel[]): DiscordChannel[] {
  return channels.filter((channel) => TEXT_CHANNEL_TYPES.has(channel.type))
}

/** Opens the channel in the Discord app (and brings it to the front). */
export function channelLink(guildId: string, channelId: string): string {
  return `discord://-/channels/${guildId}/${channelId}`
}

/** Discord IDs are snowflakes: 17–20 digits. */
export function isSnowflake(value: string): boolean {
  return /^\d{17,20}$/.test(value)
}
