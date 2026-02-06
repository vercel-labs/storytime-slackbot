import { stringToArgv } from "@tootallnate/string-argv";
import type { ModelMessage } from "ai";
import { defineHook, FatalError } from "workflow";
import { z } from "zod";
import { parseStorytimeArgs } from "../lib/args";
import { SYSTEM_PROMPT } from "../lib/prompt";

// Look ma no queues or kv!

// Steps
import {
	generateStoryPiece,
	generateStoryPieceWithStreaming,
	generateStoryPieceWithProgress,
} from "./steps/generate-story-piece";
import {
	broadcastStoryboardImage,
	generateStoryboardImage,
} from "./steps/generate-storyboard-image";
import {
	addReactionToMessage,
	postSlackMessage,
	removeReactionFromMessage,
	updateSlackMessage,
} from "./steps/post-slack-message";

const slackMessageHookSchema = z.object({
	text: z.string(),
	ts: z.string(),
});

export const slackMessageHook = defineHook({ schema: slackMessageHookSchema });

export async function storytime(slashCommand: URLSearchParams) {
	"use workflow";
	console.log(slashCommand);

	// Initialize the workflow
	const channelId = slashCommand.get("channel_id");
	if (!channelId) {
		throw new FatalError("`channel_id` is required");
	}

	const argv = stringToArgv(slashCommand.get("text") || "");
	console.log({ argv });

	const { themes, model, imageModel, imageStyle, thinkingEmoji, useStreaming } =
		parseStorytimeArgs(argv);
	console.log({ themes, model, imageModel, imageStyle, thinkingEmoji, useStreaming });

	// ...including local state like the entire message history
	let finalStory = "";
	const messages: ModelMessage[] = [
		{
			role: "system",
			content: SYSTEM_PROMPT(themes),
		},
		{
			role: "user",
			content: "Let's start a new story.",
		},
	];

	const introText = `It's storytime! I'll start the story and you continue it.`;

	let ts: string;

	if (useStreaming) {
		// Use streaming for real-time progress - shows the story as it's generated
		// First, post the intro message and generate the story with progress updates
		const { ts: introTs, message } = await postSlackMessage({
			channel: channelId,
			text: `${introText}\n\n> _Generating introduction…_ :${thinkingEmoji}:`,
		});

		ts = introTs;

		if (!message?.user) {
			throw new FatalError("Failed to get bot ID");
		}

		// Generate with streaming progress updates
		const aiResponse = await generateStoryPieceWithProgress({
			messages,
			model,
			channel: channelId,
			messageTs: ts,
			prefix: `${introText}\n\n`,
		});

		messages.push({
			role: "assistant",
			content: aiResponse.story,
		});

		// Subscribe to new messages in the thread
		const slackMessageEvent = slackMessageHook.create({
			token: `slack-message-webhook:${channelId}:${ts}`,
		});

		// Post the initial encouragement message to start the thread
		await postSlackMessage({
			channel: channelId,
			text: aiResponse.encouragement,
			thread_ts: ts,
		});

		// Process user messages in the thread (via the webhook) in
		// a loop until the LLM decides that the story is complete
		for await (const data of slackMessageEvent) {
			messages.push({
				role: "user",
				content: data.text,
			});

			// Add thinking reaction while processing
			await addReactionToMessage({
				channel: channelId,
				timestamp: data.ts,
				name: thinkingEmoji,
			});

			// Generate and stream the response directly to Slack
			const { result: aiResponse, ts: responseTs } =
				await generateStoryPieceWithStreaming({
					messages,
					model,
					channel: channelId,
					thread_ts: ts,
				});

			messages.push({
				role: "assistant",
				content: aiResponse.story,
			});

			// Remove thinking reaction and post encouragement as a separate message
			// (don't overwrite the streamed story content)
			await Promise.all([
				removeReactionFromMessage({
					channel: channelId,
					timestamp: data.ts,
					name: thinkingEmoji,
				}),
				postSlackMessage({
					channel: channelId,
					thread_ts: ts,
					text: aiResponse.encouragement,
				}),
			]);

			// If the LLM has decided that the story is complete, break the loop.
			// No more user messages will be processed in the thread after this.
			if (aiResponse.done) {
				finalStory = aiResponse.story;
				break;
			}
		}
	} else {
		// Original non-streaming implementation for backward compatibility
		const [{ ts: introTs, message }, aiResponse] = await Promise.all([
			// Create the initial top-level message in the channel with a placeholder
			postSlackMessage({
				channel: channelId,
				text: `${introText}\n\n> _Generating introduction…_ :${thinkingEmoji}:`,
			}),
			// Ask the LLM to initiate the story
			generateStoryPiece(messages, model),
		]);

		ts = introTs;

		if (!message?.user) {
			throw new FatalError("Failed to get bot ID");
		}

		await updateSlackMessage({
			channel: channelId,
			ts,
			text: `${introText}\n\n> _${aiResponse.story}_`,
		});

		messages.push({
			role: "assistant",
			content: aiResponse.story,
		});

		// Subscribe to new messages in the thread
		const slackMessageEvent = slackMessageHook.create({
			token: `slack-message-webhook:${channelId}:${ts}`,
		});

		// Post the initial encouragement message to start the thread
		await postSlackMessage({
			channel: channelId,
			text: aiResponse.encouragement,
			thread_ts: ts,
		});

		// Process user messages in the thread (via the webhook) in
		// a loop until the LLM decides that the story is complete
		for await (const data of slackMessageEvent) {
			messages.push({
				role: "user",
				content: data.text,
			});

			// Submit user's message to the LLM to continue the story
			const [aiResponse] = await Promise.all([
				generateStoryPiece(messages, model),
				addReactionToMessage({
					channel: channelId,
					timestamp: data.ts,
					name: thinkingEmoji,
				}),
			]);

			messages.push({
				role: "assistant",
				content: aiResponse.story,
			});

			await Promise.all([
				postSlackMessage({
					channel: channelId,
					thread_ts: ts,
					text: aiResponse.encouragement,
				}),
				removeReactionFromMessage({
					channel: channelId,
					timestamp: data.ts,
					name: thinkingEmoji,
				}),
			]);

			// If the LLM has decided that the story is complete, break the loop.
			// No more user messages will be processed in the thread after this.
			if (aiResponse.done) {
				finalStory = aiResponse.story;
				break;
			}
		}
	}

	const finalText = `*Here is the final story:*\n\n${finalStory
		.split("\n")
		.map((line) => `> ${line ? `_${line}_` : ""}`)
		.join("\n")}`;

	// Post the final story and generate the storyboard image
	const [{ ts: finalTs }, fileId] = await Promise.all([
		postSlackMessage({
			channel: channelId,
			text: `${finalText}\n\n_Generating storyboard image…_ :${thinkingEmoji}:`,
			thread_ts: ts,
			reply_broadcast: true,
		}),
		generateStoryboardImage(channelId, ts, finalStory, imageModel, imageStyle),
	]);

	// Update the final story message to remove the "generating storyboard image" message
	await updateSlackMessage({
		channel: channelId,
		ts: finalTs,
		text: finalText,
	});

	// Broadcast the storyboard image to the thread (if image generation succeeded)
	if (fileId) {
		await broadcastStoryboardImage(channelId, ts, fileId);
	}
}
