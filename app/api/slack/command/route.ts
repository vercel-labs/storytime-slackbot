import { stringToArgv } from "@tootallnate/string-argv";
import { waitUntil } from "@vercel/functions";
import { start } from "workflow/api";
import { parseDeploymentId } from "@/lib/args";
import { storytime } from "@/workflows/create";

async function startStorytime(formData: URLSearchParams) {
	// Only extract `--deployment-id` here; full arg parsing is deferred
	// to the workflow on the target deployment so that flag changes in a
	// preview deployment are parsed by the deployment that understands
	// them.
	const argv = stringToArgv(formData.get("text") || "");
	const deploymentId = parseDeploymentId(argv);

	console.log("Starting Storytime workflow", {
		deploymentId: deploymentId ?? "(default)",
	});

	// The `start()` overloads are split on whether `deploymentId` is
	// present, so we need separate call sites rather than passing
	// `{ deploymentId }` with a possibly-undefined value.
	if (deploymentId) {
		await start(storytime, [formData], { deploymentId });
	} else {
		await start(storytime, [formData]);
	}
}

export async function POST(req: Request) {
	const rawBody = await req.text();
	const formData = new URLSearchParams(rawBody);

	// We start the workflow in the background since
	// Slack expects a response immediately
	waitUntil(startStorytime(formData));

	return new Response(`Let's create a story!`);
}
