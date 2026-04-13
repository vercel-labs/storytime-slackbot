import { waitUntil } from "@vercel/functions";
import { start } from "workflow/api";
import { storytime } from "@/workflows/create";

async function startStorytime(formData: URLSearchParams) {
	console.log("Starting Storytime workflow");
	await start(storytime, [formData]);
}

export async function POST(req: Request) {
	const rawBody = await req.text();
	const formData = new URLSearchParams(rawBody);

	// We start the workflow in the background since
	// Slack expects a response immediately
	waitUntil(startStorytime(formData));

	return new Response(`Let's create a story!`);
}
