import { FatalError } from "workflow";
import { executeJob } from "./steps/execute-job";
import {
	postSlackMessage,
	updateSlackMessage,
	addReactionToMessage,
	removeReactionFromMessage,
} from "./steps/post-slack-message";

const AVAILABLE_JOBS: Record<
	string,
	{
		name: string;
		description: string;
		handler: (args: string[]) => Promise<{ success: boolean; output: string }>;
	}
> = {
	"fetch-trends": {
		name: "Fetch TikTok Trends",
		description: "Scrape latest TikTok trends via Apify",
		handler: async () => ({
			success: true,
			output: "Fetched 50 trending videos. Analysis ready.",
		}),
	},
	"crawl-competitors": {
		name: "Crawl Competitors",
		description: "Check competitor websites for updates",
		handler: async () => ({
			success: true,
			output: "Crawled 5 competitor sites. 2 have new features.",
		}),
	},
	"sync-github": {
		name: "Sync GitHub Issues",
		description: "Sync issues and PRs to local tracking",
		handler: async () => ({
			success: true,
			output: "Synced 12 issues, 3 PRs. 2 need review.",
		}),
	},
	"generate-report": {
		name: "Generate Weekly Report",
		description: "Compile metrics into a weekly report",
		handler: async () => ({
			success: true,
			output:
				"Weekly report generated:\n- 15% growth in users\n- 3 new features shipped\n- 2 bugs fixed",
		}),
	},
	build: {
		name: "Trigger Build",
		description: "Trigger a production build",
		handler: async () => ({
			success: true,
			output: "Build triggered. ETA: 3 minutes.",
		}),
	},
};

export async function runJob(slashCommand: URLSearchParams) {
	"use workflow";

	const channelId = slashCommand.get("channel_id");
	const text = slashCommand.get("text") || "";
	const [jobName, ...args] = text.trim().split(/\s+/);

	if (!channelId) {
		throw new FatalError("`channel_id` is required");
	}

	// List available jobs if no job specified
	if (!jobName || jobName === "help" || jobName === "list") {
		const jobList = Object.entries(AVAILABLE_JOBS)
			.map(([key, job]) => `> \`${key}\` - ${job.description}`)
			.join("\n");

		await postSlackMessage({
			channel: channelId,
			text: `*Available Jobs:*\n\n${jobList}\n\nUsage: \`/job <job-name> [args]\``,
		});
		return;
	}

	const job = AVAILABLE_JOBS[jobName];
	if (!job) {
		await postSlackMessage({
			channel: channelId,
			text: `Unknown job: \`${jobName}\`\n\nRun \`/job help\` to see available jobs.`,
		});
		return;
	}

	const { ts } = await postSlackMessage({
		channel: channelId,
		text: `Starting job: *${job.name}*\n\n_Running..._ :gear:`,
	});

	await addReactionToMessage({
		channel: channelId,
		timestamp: ts,
		name: "hourglass_flowing_sand",
	});

	const result = await executeJob(jobName, args);

	await removeReactionFromMessage({
		channel: channelId,
		timestamp: ts,
		name: "hourglass_flowing_sand",
	});

	const emoji = result.success ? ":white_check_mark:" : ":x:";
	await updateSlackMessage({
		channel: channelId,
		ts,
		text: `*${job.name}* ${emoji}\n\n${result.output}`,
	});
}
