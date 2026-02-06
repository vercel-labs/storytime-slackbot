import { generateText, streamText, type ModelMessage, Output } from "ai";
import { z } from "zod";
import { slack } from "@/lib/slack";

const StoryPieceSchema = z.object({
	done: z.boolean().describe("Whether the story is complete"),
	encouragement: z
		.string()
		.describe("An encouragement to the user to continue the story"),
	story: z
		.string()
		.describe(
			"The story introduction or the final story (if the story is complete)",
		),
});

export type StoryPiece = z.infer<typeof StoryPieceSchema>;

/**
 * Generate a story piece using the LLM.
 * This is the original non-streaming version for backward compatibility.
 */
export async function generateStoryPiece(
	messages: ModelMessage[],
	model: string,
): Promise<StoryPiece> {
	"use step";

	// Debugging
	console.log(JSON.stringify(messages, null, 2));

	console.time("Generating story piece");
	const result = await generateText({
		model,
		messages,
		experimental_output: Output.object({
			schema: StoryPieceSchema,
		}),
		experimental_telemetry: { isEnabled: true },
	});
	console.timeEnd("Generating story piece");

	return result.experimental_output;
}

export interface StreamingStoryOptions {
	messages: ModelMessage[];
	model: string;
	channel: string;
	thread_ts?: string;
	/** Buffer size for streaming updates. Higher = fewer API calls. Default: 48 */
	bufferSize?: number;
}

/**
 * Generate a story piece with real-time streaming to Slack.
 * Uses Slack's chat streaming APIs (chat.startStream, chat.appendStream, chat.stopStream)
 * to progressively show the story as it's being generated.
 *
 * The function:
 * 1. Starts a Slack stream
 * 2. Uses streamText to generate the response
 * 3. Parses the streaming JSON to extract and display the story field
 * 4. Finalizes the stream with the complete story
 *
 * @returns The parsed story piece and the message timestamp
 */
export async function generateStoryPieceWithStreaming(
	options: StreamingStoryOptions,
): Promise<{ result: StoryPiece; ts: string }> {
	"use step";

	const { messages, model, channel, thread_ts, bufferSize = 48 } = options;

	console.log("Starting streaming story generation...");
	console.log(JSON.stringify(messages, null, 2));

	// Start the Slack stream
	// Note: thread_ts is typed as required but the API accepts it as optional
	const startResult = await slack.chat.startStream({
		channel,
		thread_ts,
	} as Parameters<typeof slack.chat.startStream>[0]);

	if (!startResult.ok) {
		throw new Error(`Failed to start Slack stream: ${startResult.error}`);
	}

	const ts = startResult.ts;
	if (!ts) {
		throw new Error("Failed to start Slack stream: no timestamp returned");
	}
	let accumulatedText = "";
	let buffer = "";
	let lastStoryContent = "";

	try {
		console.time("Streaming story generation");

		// Use streamText for real-time generation with structured output
		const stream = streamText({
			model,
			messages,
			experimental_output: Output.object({
				schema: StoryPieceSchema,
			}),
			experimental_telemetry: { isEnabled: true },
		});

		// Process the text stream and extract story content
		for await (const chunk of stream.textStream) {
			accumulatedText += chunk;

			// Try to extract the story field from partial JSON
			const storyContent = extractStoryFromPartialJson(accumulatedText);

			if (storyContent && storyContent !== lastStoryContent) {
				// Calculate the new content to append
				const newContent = storyContent.slice(lastStoryContent.length);
				lastStoryContent = storyContent;

				if (newContent) {
					buffer += newContent;

					// Flush buffer when it reaches threshold
					if (buffer.length >= bufferSize) {
						await slack.chat.appendStream({
							channel,
							ts,
							markdown_text: buffer,
						});
						buffer = "";
					}
				}
			}
		}

		// Flush any remaining buffer
		if (buffer.length > 0) {
			await slack.chat.appendStream({
				channel,
				ts,
				markdown_text: buffer,
			});
		}

		console.timeEnd("Streaming story generation");

		// Get the final result by iterating through partialOutputStream
		let result: StoryPiece | undefined;
		for await (const partial of stream.experimental_partialOutputStream) {
			// Keep the last complete partial as our result
			if (partial && partial.done !== undefined && partial.story && partial.encouragement) {
				result = partial as StoryPiece;
			}
		}

		// If we couldn't get the result from partialOutputStream, parse from accumulated text
		if (!result) {
			result = parseStoryPieceFromJson(accumulatedText);
		}

		// Stop the stream to finalize the message
		await slack.chat.stopStream({
			channel,
			ts,
		});

		return { result, ts };
	} catch (error) {
		// On error, try to stop the stream gracefully
		try {
			await slack.chat.stopStream({ channel, ts });
		} catch {
			// Ignore stop errors
		}
		throw error;
	}
}

/**
 * Extract the story field from partial JSON output.
 * This handles incomplete JSON as it streams from the model.
 */
function extractStoryFromPartialJson(text: string): string | null {
	// Look for "story": " pattern and extract content after it
	const storyMatch = text.match(/"story"\s*:\s*"((?:[^"\\]|\\.)*)(?:"|$)/);
	if (storyMatch) {
		// Unescape JSON string escapes
		return storyMatch[1]
			.replace(/\\n/g, "\n")
			.replace(/\\"/g, '"')
			.replace(/\\\\/g, "\\")
			.replace(/\\t/g, "\t");
	}
	return null;
}

/**
 * Parse the complete StoryPiece from JSON text.
 */
function parseStoryPieceFromJson(text: string): StoryPiece {
	try {
		const parsed = JSON.parse(text);
		return StoryPieceSchema.parse(parsed);
	} catch {
		// If parsing fails, try to extract fields manually
		const story = extractStoryFromPartialJson(text) || "";
		const encouragementMatch = text.match(/"encouragement"\s*:\s*"((?:[^"\\]|\\.)*)"/);
		const doneMatch = text.match(/"done"\s*:\s*(true|false)/);

		return {
			story,
			encouragement: encouragementMatch
				? encouragementMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"')
				: "Keep going!",
			done: doneMatch ? doneMatch[1] === "true" : false,
		};
	}
}

export interface StreamingProgressOptions {
	messages: ModelMessage[];
	model: string;
	channel: string;
	messageTs: string;
	/** Prefix text to show before the streaming story */
	prefix?: string;
	/** Throttle interval in ms for message updates. Default: 500 */
	throttleMs?: number;
}

/**
 * Generate a story piece while showing progress in an existing Slack message.
 * Uses chat.update to periodically update the message with generation progress.
 * This is a fallback for when streaming APIs aren't available.
 *
 * @returns The parsed story piece
 */
export async function generateStoryPieceWithProgress(
	options: StreamingProgressOptions,
): Promise<StoryPiece> {
	"use step";

	const { messages, model, channel, messageTs, prefix = "", throttleMs = 500 } = options;

	console.log("Starting story generation with progress updates...");

	let accumulatedText = "";
	let lastUpdateTime = Date.now();
	let lastStoryContent = "";

	console.time("Story generation with progress");

	const stream = streamText({
		model,
		messages,
		experimental_output: Output.object({
			schema: StoryPieceSchema,
		}),
		experimental_telemetry: { isEnabled: true },
	});

	// Process the text stream and update message periodically
	for await (const chunk of stream.textStream) {
		accumulatedText += chunk;

		const storyContent = extractStoryFromPartialJson(accumulatedText);
		const now = Date.now();

		// Update message at throttled intervals when we have new story content
		if (storyContent && storyContent !== lastStoryContent && now - lastUpdateTime >= throttleMs) {
			lastStoryContent = storyContent;
			lastUpdateTime = now;

			await slack.chat.update({
				channel,
				ts: messageTs,
				text: `${prefix}> _${storyContent}_ :writing_hand:`,
			});
		}
	}

	console.timeEnd("Story generation with progress");

	// Get the final result from partialOutputStream
	let result: StoryPiece | undefined;
	for await (const partial of stream.experimental_partialOutputStream) {
		if (partial && partial.done !== undefined && partial.story && partial.encouragement) {
			result = partial as StoryPiece;
		}
	}

	// If we couldn't get the result from partialOutputStream, parse from accumulated text
	if (!result) {
		result = parseStoryPieceFromJson(accumulatedText);
	}

	// Final update with complete story (without typing indicator)
	await slack.chat.update({
		channel,
		ts: messageTs,
		text: `${prefix}> _${result.story}_`,
	});

	return result;
}
