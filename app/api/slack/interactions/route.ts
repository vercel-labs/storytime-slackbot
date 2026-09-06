import { waitUntil } from "@vercel/functions";
import { start } from "workflow/api";
import { z } from "zod";
import { slack } from "@/lib/slack";
import { isValidSlackRequest } from "@/lib/slack-request";
import {
	STORYTIME_MODAL_CALLBACK,
	parseStorytimeModal,
	storytimeModalContextSchema,
	storytimeModalStateSchema,
} from "@/lib/storytime-modal";
import { storytime } from "@/workflows/create";

const submissionSchema = z.object({
	type: z.literal("view_submission"),
	user: z.object({ id: z.string() }),
	team: z.object({ id: z.string() }).nullable(),
	view: z.object({
		callback_id: z.literal(STORYTIME_MODAL_CALLBACK),
		private_metadata: z.string(),
		state: z.object({ values: storytimeModalStateSchema }),
	}),
});

export async function POST(req: Request) {
	const rawBody = await req.text();
	if (!isValidSlackRequest(req, rawBody)) {
		return new Response("Invalid Slack signature", { status: 401 });
	}
	let payload;
	try {
		payload = JSON.parse(new URLSearchParams(rawBody).get("payload") || "");
	} catch {
		return new Response("Invalid interaction payload", { status: 400 });
	}
	if (
		payload?.type !== "view_submission" ||
		payload?.view?.callback_id !== STORYTIME_MODAL_CALLBACK
	) {
		return new Response();
	}
	const submission = submissionSchema.safeParse(payload);
	if (!submission.success)
		return new Response("Invalid view submission", { status: 400 });
	let context;
	try {
		context = storytimeModalContextSchema.parse(
			JSON.parse(submission.data.view.private_metadata),
		);
	} catch {
		return new Response("Invalid modal context", { status: 400 });
	}
	if (
		context.userId !== submission.data.user.id ||
		(submission.data.team !== null && context.teamId !== submission.data.team.id)
	) {
		return new Response("Modal context does not match submitter", {
			status: 403,
		});
	}
	const result = parseStorytimeModal(submission.data.view.state.values);
	if (result.errors)
		return Response.json({ response_action: "errors", errors: result.errors });
	const { channelId, userId } = context;
	// Acknowledge the submission immediately; no AI work runs in this request.
	waitUntil(
		start(storytime, [channelId, result.args]).catch(async (error) => {
			console.error("Could not start Storytime workflow", error);
			try {
				await slack.chat.postEphemeral({
					channel: channelId,
					user: userId,
					text: "Could not start the story. Please try /storytime again.",
				});
			} catch (notificationError) {
				console.error("Could not notify Storytime user", notificationError);
			}
		}),
	);
	return new Response();
}
