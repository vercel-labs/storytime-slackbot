import { stringToArgv } from "@tootallnate/string-argv";
import { waitUntil } from "@vercel/functions";
import { start } from "workflow/api";
import { z } from "zod";
import { parseStorytimeArgs } from "@/lib/args";
import { slack } from "@/lib/slack";
import { stripBotMention } from "@/lib/slack-mention";
import { isValidSlackRequest } from "@/lib/slack-request";
import { slackMessageHook, storytime } from "@/workflows/create";

const slackMessageSchema = z.object({
	event: z.object({
		type: z.literal("message"),
		channel: z.string(),
		thread_ts: z.string(),
		text: z.string(),
		ts: z.string(),
		bot_id: z.string().optional(),
	}),
});

const appMentionSchema = z.object({
	event: z.object({
		type: z.literal("app_mention"),
		channel: z.string(),
		user: z.string(),
		text: z.string(),
		ts: z.string(),
		thread_ts: z.string().optional(),
		bot_id: z.string().optional(),
	}),
	// The bot user the app is installed as, so its own mention can be told
	// apart from other users mentioned in the same message.
	authorizations: z.array(z.object({ user_id: z.string() })).optional(),
});

export async function POST(req: Request) {
	const rawBody = await req.text();
	if (!isValidSlackRequest(req, rawBody)) {
		return new Response("Unauthorized", { status: 401 });
	}
	const body = JSON.parse(rawBody);

	// Slack Events API URL Verification
	if (body.type === "url_verification") {
		return new Response(body.challenge, {
			headers: {
				"Content-Type": "text/plain",
			},
		});
	}

	const mention = appMentionSchema.safeParse(body);
	if (mention.success) {
		// Slack expects an acknowledgement within three seconds, so the story
		// starts in the background.
		waitUntil(
			startStoryFromMention(mention.data, req.headers.get("x-slack-retry-num")),
		);
		return new Response("OK");
	}

	const parsedBody = slackMessageSchema.safeParse(body);
	if (parsedBody.success) {
		const { channel, thread_ts, bot_id } = parsedBody.data.event;
		if (bot_id) {
			console.log(`Ignoring bot message`);
		} else {
			try {
				const token = `slack-message-webhook:${channel}:${thread_ts}`;
				const hook = await slackMessageHook.resume(
					token,
					parsedBody.data.event,
				);
				console.log(`Hook resumed for token: ${token} (${hook.runId})`);
			} catch (error) {
				// `resume()` will nominally throw if the hook is not found
				// (i.e. someone posted in a thread that is not a Storytime thread),
				// but we don't want to fail the webhook request
				console.warn(`Error resuming hook: ${error}`);
			}
		}
	}

	return new Response("OK");
}

/**
 * Starts a story from an `@Storytime` mention. The slash command has a
 * `trigger_id` and can open the configuration modal to collect options; a
 * mention has none, so it starts the story right away using the same flags
 * the slash command accepts. Never rejects: Slack only needs the 200.
 */
async function startStoryFromMention(
	{ event, authorizations }: z.infer<typeof appMentionSchema>,
	retryNum: string | null,
) {
	const { channel, user, text, ts, thread_ts, bot_id } = event;
	if (bot_id) {
		console.log(`Ignoring mention from a bot`);
		return;
	}
	// Replies in a story thread continue that story through the `message`
	// event above, so a mention there must not start a second one.
	if (thread_ts && thread_ts !== ts) {
		console.log(`Ignoring mention inside thread: ${thread_ts}`);
		return;
	}
	// Slack redelivers events it considers undelivered. The first delivery has
	// already started a story, and starting another would duplicate it.
	if (retryNum) {
		console.log(`Ignoring redelivered mention (retry ${retryNum})`);
		return;
	}
	let args;
	try {
		args = {
			...parseStorytimeArgs(
				stringToArgv(stripBotMention(text, authorizations?.[0]?.user_id)),
			),
			// Gateway request transcripts stay off for Slack sessions, the same
			// way the configuration modal leaves them out of a slash command.
			transcripts: false,
		};
	} catch (error) {
		await notify(
			channel,
			user,
			error instanceof Error ? error.message : "Invalid storytime options.",
		);
		return;
	}
	try {
		await start(storytime, [channel, args]);
		console.log(`Story started from a mention in ${channel}`);
	} catch (error) {
		console.error("Could not start Storytime workflow", error);
		await notify(
			channel,
			user,
			"Could not start the story. Please try mentioning the bot again.",
		);
	}
}

async function notify(channel: string, user: string, text: string) {
	try {
		await slack.chat.postEphemeral({ channel, user, text });
	} catch (error) {
		console.error("Could not notify Storytime user", error);
	}
}
