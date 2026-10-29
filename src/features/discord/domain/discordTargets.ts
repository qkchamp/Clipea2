/** A channel with direct sending; the webhook URL itself never leaves the main process. */
export interface WebhookTarget {
  guildId: string
  guildName: string
  channelId: string
  channelName: string
}
