import { z } from "zod";
import { storytimeToken, tiktokFeedbackToken } from "@/lib/hook-tokens";
import { slackMessageHook } from "@/workflows/create";
import { tiktokFeedbackHook } from "@/workflows/tiktok-post";

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

export async function POST(req: Request) {
	const body = await req.json();

	console.log(body);

	// Slack Events API URL Verification
	if (body.type === "url_verification") {
		return new Response(body.challenge, {
			headers: {
				"Content-Type": "text/plain",
			},
		});
	}

	// TODO: validate webhook body
	// https://api.slack.com/authentication/verifying-requests-from-slack

	const parsedBody = slackMessageSchema.safeParse(body);
	if (parsedBody.success) {
		const { channel, thread_ts, text, ts, bot_id } = parsedBody.data.event;
		if (bot_id) {
			console.log(`Ignoring bot message`);
		} else {
			// Try storytime hook (catch errors - hook may not exist)
			try {
				const stToken = storytimeToken(channel, thread_ts);
				const stHook = await slackMessageHook.resume(stToken, { text, ts });
				if (stHook) {
					console.log(`Storytime hook resumed: ${stToken} (${stHook.runId})`);
					return new Response("OK");
				}
			} catch (e) {
				// Hook not found, try next
			}

			// Try tiktokpost feedback hook
			try {
				const ttToken = tiktokFeedbackToken(channel, thread_ts);
				const ttHook = await tiktokFeedbackHook.resume(ttToken, { text, ts });
				if (ttHook) {
					console.log(`TikTok hook resumed: ${ttToken} (${ttHook.runId})`);
					return new Response("OK");
				}
			} catch (e) {
				// Hook not found
			}

			console.log(`No hook found for channel:${channel} thread:${thread_ts}`);
		}
	}

	return new Response("OK");
}
