import type { KnownBlock } from "@slack/web-api";
import { FatalError } from "workflow";

const MAX_MESSAGE_LENGTH = 2500;
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

/**
 * Converts errors that won't succeed on retry, such as content moderation
 * rejections and invalid requests, into a `FatalError` so the step fails fast.
 */
export function toStepError(error: unknown): unknown {
	const message = messageOf(error) ?? String(error);
	const status =
		error && typeof error === "object" && "statusCode" in error
			? error.statusCode
			: undefined;
	const isClientError =
		typeof status === "number" && status >= 400 && status < 500 && status !== 429;
	if (MODERATION_PATTERN.test(message) || isClientError) {
		const fatal = new FatalError(message);
		fatal.cause = error;
		return fatal;
	}
	return error;
}

// Escapes text for Slack mrkdwn.
const escape = (text: string) =>
	text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Builds a Block Kit message reporting a failed image or video generation,
 * with the workflow run ID (linked to the dashboard when `runUrl` is known).
 */
export function generationErrorMessage({
	outputName,
	model,
	message,
	runId,
	runUrl,
}: {
	outputName: string;
	model: string;
	message: string;
	runId: string;
	runUrl?: string;
}): { text: string; blocks: KnownBlock[] } {
	const hint = MODERATION_PATTERN.test(message)
		? "The model's content moderation rejected it. Try a different visual style or model."
		: "Something went wrong while generating it.";
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
								text:
									message.length > MAX_MESSAGE_LENGTH
										? `${message.slice(0, MAX_MESSAGE_LENGTH - 1)}…`
										: message,
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
						text: `Model: \`${escape(model)}\` · Workflow run: ${run}`,
					},
				],
			},
		],
	};
}
