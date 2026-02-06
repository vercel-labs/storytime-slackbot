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
 * Unescape JSON string escape sequences.
 * Used consistently across all JSON parsing functions.
 */
function unescapeJsonString(str: string): string {
	return str
		.replace(/\\n/g, "\n")
		.replace(/\\r/g, "\r")
		.replace(/\\t/g, "\t")
		.replace(/\\"/g, '"')
		.replace(/\\\\/g, "\\");
}

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
						const appendResult = await slack.chat.appendStream({
							channel,
							ts,
							markdown_text: buffer,
						});
						if (!appendResult.ok) {
							console.warn(
								`Failed to append to stream: ${appendResult.error}`,
							);
						}
						buffer = "";
					}
				}
			}
		}

		// Flush any remaining buffer
		if (buffer.length > 0) {
			const appendResult = await slack.chat.appendStream({
				channel,
				ts,
				markdown_text: buffer,
			});
			if (!appendResult.ok) {
				console.warn(`Failed to append final buffer: ${appendResult.error}`);
			}
		}

		console.timeEnd("Streaming story generation");

		// Get the final result by iterating through partialOutputStream
		let result: StoryPiece | undefined;
		for await (const partial of stream.experimental_partialOutputStream) {
			// Use typeof checks to handle empty strings correctly
			if (
				partial &&
				typeof partial.done === "boolean" &&
				typeof partial.story === "string" &&
				typeof partial.encouragement === "string"
			) {
				result = partial as StoryPiece;
			}
		}

		// If we couldn't get the result from partialOutputStream, parse from accumulated text
		if (!result) {
			result = parseStoryPieceFromJson(accumulatedText);
		}

		// Stop the stream to finalize the message
		const stopResult = await slack.chat.stopStream({
			channel,
			ts,
		});
		if (!stopResult.ok) {
			console.warn(`Failed to stop stream: ${stopResult.error}`);
		}

		return { result, ts };
	} catch (error) {
		// On error, try to stop the stream gracefully
		try {
			await slack.chat.stopStream({ channel, ts });
		} catch {
			// Ignore stop errors during cleanup
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
		return unescapeJsonString(storyMatch[1]);
	}
	return null;
}

/**
 * Extract a string field from partial JSON output.
 */
function extractStringFieldFromJson(
	text: string,
	fieldName: string,
): string | null {
	const regex = new RegExp(`"${fieldName}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`);
	const match = text.match(regex);
	if (match) {
		return unescapeJsonString(match[1]);
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
		const encouragement =
			extractStringFieldFromJson(text, "encouragement") || "Keep going!";
		const doneMatch = text.match(/"done"\s*:\s*(true|false)/);

		return {
			story,
			encouragement,
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

	const {
		messages,
		model,
		channel,
		messageTs,
		prefix = "",
		throttleMs = 500,
	} = options;

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
		if (
			storyContent &&
			storyContent !== lastStoryContent &&
			now - lastUpdateTime >= throttleMs
		) {
			lastStoryContent = storyContent;
			lastUpdateTime = now;

			const updateResult = await slack.chat.update({
				channel,
				ts: messageTs,
				text: `${prefix}> _${storyContent}_ :writing_hand:`,
			});
			if (!updateResult.ok) {
				console.warn(`Failed to update progress: ${updateResult.error}`);
			}
		}
	}

	console.timeEnd("Story generation with progress");

	// Get the final result from partialOutputStream
	let result: StoryPiece | undefined;
	for await (const partial of stream.experimental_partialOutputStream) {
		// Use typeof checks to handle empty strings correctly
		if (
			partial &&
			typeof partial.done === "boolean" &&
			typeof partial.story === "string" &&
			typeof partial.encouragement === "string"
		) {
			result = partial as StoryPiece;
		}
	}

	// If we couldn't get the result from partialOutputStream, parse from accumulated text
	if (!result) {
		result = parseStoryPieceFromJson(accumulatedText);
	}

	// Final update with complete story (without typing indicator)
	const finalUpdateResult = await slack.chat.update({
		channel,
		ts: messageTs,
		text: `${prefix}> _${result.story}_`,
	});
	if (!finalUpdateResult.ok) {
		console.warn(`Failed to update final story: ${finalUpdateResult.error}`);
	}

	return result;
}
