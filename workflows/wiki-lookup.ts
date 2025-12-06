import type { ModelMessage } from "ai";
import { FatalError } from "workflow";
import { queryWiki } from "./steps/query-wiki";
import { postSlackMessage, updateSlackMessage } from "./steps/post-slack-message";

export async function wikiLookup(slashCommand: URLSearchParams) {
	"use workflow";

	const channelId = slashCommand.get("channel_id");
	const query = slashCommand.get("text") || "";

	if (!channelId) {
		throw new FatalError("`channel_id` is required");
	}

	if (!query.trim()) {
		await postSlackMessage({
			channel: channelId,
			text:
				"*Usage:* `/wiki <repo> <question>`\n\n" +
				"Examples:\n" +
				"> `/wiki vercel/ai how do I use streaming?`\n" +
				"> `/wiki anthropics/anthropic-sdk-python rate limiting`\n" +
				"> `/wiki vercel/workflow hooks and steps`",
		});
		return;
	}

	// Parse repo and question from query
	const parts = query.trim().split(/\s+/);
	let repo = parts[0];
	let question = parts.slice(1).join(" ");

	// Handle common shortcuts
	const REPO_SHORTCUTS: Record<string, string> = {
		workflow: "vercel/workflow",
		ai: "vercel/ai",
		next: "vercel/next.js",
		anthropic: "anthropics/anthropic-sdk-python",
		claude: "anthropics/anthropic-sdk-python",
		openai: "openai/openai-node",
		langchain: "langchain-ai/langchainjs",
		react: "facebook/react",
	};

	if (REPO_SHORTCUTS[repo.toLowerCase()]) {
		repo = REPO_SHORTCUTS[repo.toLowerCase()];
	}

	// If no question provided, show repo structure
	if (!question) {
		question = "What are the main concepts and how do I get started?";
	}

	const { ts } = await postSlackMessage({
		channel: channelId,
		text: `Looking up *${repo}*: "${question}"\n\n_Searching docs..._ :mag:`,
	});

	const result = await queryWiki(repo, question);

	const formatted = formatWikiResult(repo, question, result);

	await updateSlackMessage({
		channel: channelId,
		ts,
		text: formatted,
	});
}

function formatWikiResult(
	repo: string,
	question: string,
	result: { answer: string; sources?: string[] },
): string {
	let text = `*${repo}* - "${question}"\n\n`;
	text += result.answer;

	if (result.sources?.length) {
		text += "\n\n*Sources:*\n";
		for (const source of result.sources) {
			text += `> ${source}\n`;
		}
	}

	return text;
}
