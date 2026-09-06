import { z } from "zod";
import { isValidSlackRequest } from "@/lib/slack-request";
import { slackMessageHook } from "@/workflows/create";

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
