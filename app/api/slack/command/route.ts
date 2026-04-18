import { stringToArgv } from "@tootallnate/string-argv";
import { waitUntil } from "@vercel/functions";
import { start } from "workflow/api";
import { parseStorytimeArgs, type StorytimeArgs } from "@/lib/args";
import { storytime } from "@/workflows/create";

async function startStorytime(channelId: string, args: StorytimeArgs) {
	console.log("Starting Storytime workflow", {
		channelId,
		deploymentId: args.deploymentId ?? "(default)",
	});

	// If a --deployment-id was provided, route the workflow run to that
	// specific deployment. This is useful for testing workflow changes
	// from a branch's preview deployment.
	if (args.deploymentId) {
		await start(storytime, [channelId, args], {
			deploymentId: args.deploymentId,
		});
	} else {
		await start(storytime, [channelId, args]);
	}
}

export async function POST(req: Request) {
	const rawBody = await req.text();
	const formData = new URLSearchParams(rawBody);

	const channelId = formData.get("channel_id");
	if (!channelId) {
		return new Response("`channel_id` is required", { status: 400 });
	}

	let args: StorytimeArgs;
	try {
		const argv = stringToArgv(formData.get("text") || "");
		args = parseStorytimeArgs(argv);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return new Response(`Invalid command: ${message}`, { status: 200 });
	}

	// We start the workflow in the background since
	// Slack expects a response immediately
	waitUntil(startStorytime(channelId, args));

	return new Response(`Let's create a story!`);
}
