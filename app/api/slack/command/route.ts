import { stringToArgv } from "@tootallnate/string-argv";
import { parseStorytimeArgs } from "@/lib/args";
import { modalSlack } from "@/lib/slack";
import { isValidSlackRequest } from "@/lib/slack-request";
import { buildStorytimeModal } from "@/lib/storytime-modal";

export async function POST(req: Request) {
	const rawBody = await req.text();
	if (!isValidSlackRequest(req, rawBody)) {
		return new Response("Invalid Slack signature", { status: 401 });
	}
	const formData = new URLSearchParams(rawBody);
	const triggerId = formData.get("trigger_id");
	const channelId = formData.get("channel_id");
	const userId = formData.get("user_id");
	const teamId = formData.get("team_id");
	if (!triggerId || !channelId || !userId || !teamId) {
		return new Response("Missing Slack command context", { status: 400 });
	}
	let args;
	try {
		args = parseStorytimeArgs(stringToArgv(formData.get("text") || ""));
	} catch (error) {
		return Response.json({
			response_type: "ephemeral",
			text:
				error instanceof Error ? error.message : "Invalid storytime options.",
		});
	}
	try {
		await modalSlack.views.open({
			trigger_id: triggerId,
			view: buildStorytimeModal(args, { channelId, userId, teamId }),
		});
		return new Response();
	} catch (error) {
		console.error("Could not open Storytime configuration", error);
		return Response.json({
			response_type: "ephemeral",
			text: "Could not open Storytime configuration. Please try /storytime again.",
		});
	}
}
