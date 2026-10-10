// Slack renders a user mention as `<@U0LAN0Z89>`, and some payloads still
// carry a label: `<@U0LAN0Z89|storytime>`. Channel links (`<#C0LAN0Z89>`) and
// special mentions (`<!here>`) use other prefixes, so they are left alone.
const USER_MENTION = /<@([A-Z0-9]+)(?:\|[^>]*)?>/g;

/**
 * Removes the bot's own mention from an `app_mention` event's text, leaving
 * the Storytime flags that were typed around it. Slack keeps the mention
 * wherever the user put it, so it is dropped from anywhere in the message,
 * while mentions of other users are preserved. When the bot's user ID is
 * unknown, every user mention is dropped instead.
 */
export function stripBotMention(text: string, botUserId?: string): string {
	return text
		.replace(USER_MENTION, (mention, userId) =>
			!botUserId || userId === botUserId ? " " : mention,
		)
		.trim();
}
