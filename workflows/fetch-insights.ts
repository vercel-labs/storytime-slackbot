import { FatalError } from "workflow";
import { fetchPostHogInsights } from "./steps/fetch-posthog";
import { postSlackMessage, updateSlackMessage } from "./steps/post-slack-message";

export async function fetchInsights(slashCommand: URLSearchParams) {
	"use workflow";

	const channelId = slashCommand.get("channel_id");
	const query = slashCommand.get("text") || "last 7 days";

	if (!channelId) {
		throw new FatalError("`channel_id` is required");
	}

	const { ts } = await postSlackMessage({
		channel: channelId,
		text: `Fetching insights: *${query}*\n\n_Loading..._ :chart_with_upwards_trend:`,
	});

	const insights = await fetchPostHogInsights(query);

	const formatted = formatInsights(insights);

	await updateSlackMessage({
		channel: channelId,
		ts,
		text: formatted,
	});
}

function formatInsights(insights: {
	project: string;
	period: string;
	metrics: {
		name: string;
		value: number | string;
		change?: string;
	}[];
	topEvents?: { name: string; count: number }[];
}) {
	let text = `*${insights.project} Insights* (${insights.period})\n\n`;

	text += "*Key Metrics:*\n";
	for (const metric of insights.metrics) {
		const change = metric.change ? ` (${metric.change})` : "";
		text += `> ${metric.name}: *${metric.value}*${change}\n`;
	}

	if (insights.topEvents?.length) {
		text += "\n*Top Events:*\n";
		for (const event of insights.topEvents.slice(0, 5)) {
			text += `> ${event.name}: ${event.count.toLocaleString()}\n`;
		}
	}

	return text;
}
