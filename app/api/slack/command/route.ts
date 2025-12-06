import { waitUntil } from "@vercel/functions";
import { start } from "workflow/api";
import { storytime } from "@/workflows/create";
import { tiktokPost } from "@/workflows/tiktok-post";
import { fetchInsights } from "@/workflows/fetch-insights";
import { wikiLookup } from "@/workflows/wiki-lookup";
import { runJob } from "@/workflows/run-job";

type CommandHandler = {
	workflow: (formData: URLSearchParams) => Promise<void>;
	response: string;
};

const COMMANDS: Record<string, CommandHandler> = {
	"/storytime": {
		workflow: async (formData) => {
			const w = await start(storytime, [formData]);
			console.log("Started storytime:", w);
		},
		response: "Let's create a story!",
	},
	"/tiktokpost": {
		workflow: async (formData) => {
			const w = await start(tiktokPost, [formData]);
			console.log("Started tiktokpost:", w);
		},
		response: "Generating TikTok content...",
	},
	"/insights": {
		workflow: async (formData) => {
			const w = await start(fetchInsights, [formData]);
			console.log("Started insights:", w);
		},
		response: "Fetching insights...",
	},
	"/wiki": {
		workflow: async (formData) => {
			const w = await start(wikiLookup, [formData]);
			console.log("Started wiki lookup:", w);
		},
		response: "Looking up documentation...",
	},
	"/job": {
		workflow: async (formData) => {
			const w = await start(runJob, [formData]);
			console.log("Started job:", w);
		},
		response: "Starting job...",
	},
};

export async function POST(req: Request) {
	const rawBody = await req.text();
	const formData = new URLSearchParams(rawBody);
	const command = formData.get("command") || "/storytime";

	const handler = COMMANDS[command];
	if (!handler) {
		return new Response(
			`Unknown command: ${command}\nAvailable: ${Object.keys(COMMANDS).join(", ")}`,
		);
	}

	waitUntil(handler.workflow(formData));
	return new Response(handler.response);
}
