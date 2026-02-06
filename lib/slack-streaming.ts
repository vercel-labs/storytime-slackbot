import { slack } from "./slack";

export interface StreamOptions {
	channel: string;
	thread_ts?: string;
	/** Buffer size in characters before sending to Slack. Higher = fewer API calls but less responsive. Default: 64 */
	bufferSize?: number;
}

export interface SlackStreamWriter {
	/** Write text to the stream */
	write(text: string): Promise<void>;
	/** Stop the stream and finalize the message */
	stop(): Promise<void>;
	/** The timestamp of the streaming message */
	ts: string;
}

/**
 * Create a stream writer for easy streaming of LLM responses to Slack.
 * Uses Slack's chat streaming APIs (chat.startStream, chat.appendStream, chat.stopStream)
 * to progressively show text as it's being generated.
 *
 * @example
 * ```ts
 * const writer = await createSlackStreamWriter({ channel, thread_ts });
 *
 * for await (const chunk of streamText(...).textStream) {
 *   await writer.write(chunk);
 * }
 *
 * await writer.stop();
 * ```
 */
export async function createSlackStreamWriter(
	options: StreamOptions,
): Promise<SlackStreamWriter> {
	// Note: thread_ts is typed as required but the API accepts it as optional
	// when starting a stream in a channel (not in a thread)
	const startResult = await slack.chat.startStream({
		channel: options.channel,
		thread_ts: options.thread_ts,
	} as Parameters<typeof slack.chat.startStream>[0]);

	if (!startResult.ok) {
		throw new Error(`Failed to start Slack stream: ${startResult.error}`);
	}

	const ts = startResult.ts;
	if (!ts) {
		throw new Error("Failed to start Slack stream: no timestamp returned");
	}
	const channel = options.channel;
	const bufferSize = options.bufferSize ?? 64;

	let buffer = "";

	return {
		ts,
		async write(text: string): Promise<void> {
			buffer += text;

			// Only send when buffer reaches threshold
			if (buffer.length >= bufferSize) {
				await slack.chat.appendStream({
					channel,
					ts,
					markdown_text: buffer,
				});
				buffer = "";
			}
		},
		async stop(): Promise<void> {
			// Flush any remaining buffer
			if (buffer.length > 0) {
				await slack.chat.appendStream({
					channel,
					ts,
					markdown_text: buffer,
				});
			}

			await slack.chat.stopStream({
				channel,
				ts,
			});
		},
	};
}

/**
 * Append text to an existing Slack stream.
 * Text is buffered before being sent to reduce API calls.
 */
export async function appendToStream(
	channel: string,
	ts: string,
	text: string,
): Promise<void> {
	"use step";

	await slack.chat.appendStream({
		channel,
		ts,
		markdown_text: text,
	});
}

/**
 * Stop a Slack stream, finalizing the message.
 * Optionally include feedback blocks for user interaction.
 */
export async function stopStream(
	channel: string,
	ts: string,
): Promise<void> {
	"use step";

	await slack.chat.stopStream({
		channel,
		ts,
	});
}
