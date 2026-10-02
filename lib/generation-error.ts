import type { KnownBlock } from "@slack/web-api";

const MAX_MESSAGE_LENGTH = 2500;
const MAX_NOTICE_MESSAGE_LENGTH = 300;
const MODERATION_PATTERN = /moderat/i;

const messageOf = (value: unknown) =>
	value && typeof value === "object" && "message" in value
		? String(value.message)
		: undefined;

/**
 * Extracts the underlying error message. Steps that exhaust their retries fail
 * with `Step "…" failed after N retries: <message>`, keeping the original error
 * as `cause`.
 */
export function getErrorMessage(error: unknown): string {
	const cause =
		error && typeof error === "object" && "cause" in error
			? messageOf(error.cause)
			: undefined;
	const message =
		cause ??
		messageOf(error)?.replace(/^Step ".*?" failed after \d+ retr(?:y|ies): /, "") ??
		String(error);
	return message.trim() || "Unknown error";
}

// Escapes text for Slack mrkdwn.
const escape = (text: string) =>
	text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const truncate = (text: string, length: number) =>
	text.length > length ? `${text.slice(0, length - 1)}…` : text;

/** Builds a thread notice that a model failed and a fallback is being tried. */
export function fallbackNoticeMessage({
	outputName,
	model,
	nextModel,
	message,
}: {
	outputName: string;
	model: string;
	nextModel: string;
	message: string;
}): { text: string; blocks: KnownBlock[] } {
	const reason = truncate(message, MAX_NOTICE_MESSAGE_LENGTH);
	return {
		text: `${model} couldn't generate the ${outputName} (${reason}). Trying ${nextModel}…`,
		blocks: [
			{
				type: "context",
				elements: [
					{
						type: "mrkdwn",
						text: `:arrows_counterclockwise: \`${escape(model)}\` couldn't generate the ${outputName}: ${escape(reason)}\nTrying \`${escape(nextModel)}\` instead…`,
					},
				],
			},
		],
	};
}

/**
 * Builds a Block Kit message reporting a failed image or video generation
 * (the last model's error is shown; earlier failures get fallback notices),
 * with the workflow run ID (linked to the dashboard when `runUrl` is known).
 */
export function generationErrorMessage({
	outputName,
	models,
	message,
	runId,
	runUrl,
}: {
	outputName: string;
	/** Every model tried, in order. */
	models: string[];
	message: string;
	runId: string;
	runUrl?: string;
}): { text: string; blocks: KnownBlock[] } {
	const hint = MODERATION_PATTERN.test(message)
		? "The model's content moderation rejected it. Try a different visual style or model."
		: "Something went wrong while generating it.";
	const modelList = models.map((m) => `\`${escape(m)}\``).join(", ");
	const title = `The ${outputName} could not be generated`;
	const run = runUrl ? `<${runUrl}|${escape(runId)}>` : `\`${escape(runId)}\``;
	return {
		text: `⚠️ ${title}: ${message}`,
		blocks: [
			{
				type: "section",
				text: {
					type: "mrkdwn",
					text: `:warning: *${title}*\n${hint} Run \`/storytime\` to start a new story.`,
				},
			},
			{
				type: "rich_text",
				elements: [
					{
						type: "rich_text_preformatted",
						elements: [
							{
								type: "text",
								text: truncate(message, MAX_MESSAGE_LENGTH),
							},
						],
					},
				],
			},
			{
				type: "context",
				elements: [
					{
						type: "mrkdwn",
						text: `${models.length > 1 ? "Models tried" : "Model"}: ${modelList} · Workflow run: ${run}`,
					},
				],
			},
		],
	};
}
