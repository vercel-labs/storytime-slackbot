import { experimental_generateVideo as generateVideo } from "@ai-sdk/workflow/video";
import type { ModelMessage } from "ai";
import { defineHook, FatalError } from "workflow";
import { z } from "zod";
import type { StorytimeArgs } from "../lib/args";
import {
	IMAGE_FALLBACK_MODELS,
	VIDEO_FALLBACK_MODELS,
	withFallbacks,
} from "../lib/fallback-models";
import { getErrorMessage } from "../lib/generation-error";
import { SYSTEM_PROMPT, VIDEO_GEN_PROMPT } from "../lib/prompt";

// Look ma no queues or kv!

// Steps
import { generateStoryPiece } from "./steps/generate-story-piece";
import { generateVideoScript } from "./steps/generate-video-script";
import {
	postFallbackNotice,
	postGenerationError,
} from "./steps/post-generation-error";
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
import { uploadStoryVideo } from "./steps/upload-story-video";

const slackMessageHookSchema = z.object({
	text: z.string(),
	ts: z.string(),
});

export const slackMessageHook = defineHook({ schema: slackMessageHookSchema });

export async function storytime(channelId: string, options: StorytimeArgs) {
	"use workflow";

	// Initialize the workflow
	if (!channelId) {
		throw new FatalError("`channel_id` is required");
	}

	const {
		themes,
		model,
		imageModel,
		style,
		thinkingEmoji,
		panels,
		video,
		videoModel,
		videoDuration,
		transcripts,
	} = options;

	// ...including local state like the entire message history
	let finalStory = "";
	const instructions = SYSTEM_PROMPT(themes);
	const messages: ModelMessage[] = [
		{
			role: "user",
			content: "Let's start a new story.",
		},
	];

	const introText = `It's storytime! I'll start the story and you continue it.`;

	const [{ ts, message }, aiResponse] = await Promise.all([
		// Create the initial top-level message in the channel with a placeholder
		postSlackMessage({
			channel: channelId,
			text: `${introText}\n\n> _Generating introduction…_ :${thinkingEmoji}:`,
		}),
		// Ask the LLM to initiate the story
		generateStoryPiece(messages, model, instructions, transcripts),
	]);

	const botId = message?.user;
	if (!botId) {
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
			generateStoryPiece(messages, model, instructions, transcripts),
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

	const finalText = `*Here is the final story:*\n\n${finalStory
		.split("\n")
		.map((line) => `> ${line ? `_${line}_` : ""}`)
		.join("\n")}`;

	const outputName = video ? "story video" : "storyboard image";
	const { ts: finalTs } = await postSlackMessage({
		channel: channelId,
		text: `${finalText}\n\n_Generating ${outputName}…_ :${thinkingEmoji}:`,
		thread_ts: ts,
		reply_broadcast: true,
	});

	const mediaModels = video
		? withFallbacks(videoModel, VIDEO_FALLBACK_MODELS)
		: withFallbacks(imageModel, IMAGE_FALLBACK_MODELS);
	// The image step tries every model via retries; video tracks its own attempts.
	let triedModels: string[] = video ? [] : mediaModels;
	let fileId: string;
	try {
		if (video) {
			const script = await generateVideoScript(
				finalStory,
				model,
				style,
				videoDuration,
				transcripts,
			);
			// Video generation runs in workflow context so rendering suspends on the
			// provider webhook. It isn't a step, so fall back with a loop instead.
			let generated: Awaited<ReturnType<typeof generateVideo>>["videos"][number];
			for (const [i, candidate] of mediaModels.entries()) {
				triedModels = mediaModels.slice(0, i + 1);
				try {
					const result = await generateVideo({
						model: candidate,
						prompt: VIDEO_GEN_PROMPT(script, style),
						duration: videoDuration,
						providerOptions: transcripts
							? { gateway: { transcripts: { enabled: true } } }
							: undefined,
					});
					if (!result.videos[0]) {
						throw new Error(`The model "${candidate}" did not return a video.`);
					}
					generated = result.videos[0];
					break;
				} catch (error) {
					const nextModel = mediaModels[i + 1];
					if (!nextModel) throw error;
					await postFallbackNotice(channelId, ts, {
						outputName,
						model: candidate,
						nextModel,
						message: getErrorMessage(error),
					}).catch(() => {});
				}
			}
			fileId = await uploadStoryVideo(channelId, ts, generated!);
		} else {
			fileId = await generateStoryboardImage(
				channelId,
				ts,
				finalStory,
				imageModel,
				style,
				panels,
				transcripts,
			);
		}
	} catch (error) {
		// Replace the generation status and report the error in the thread,
		// so the session doesn't appear stuck.
		await Promise.all([
			updateSlackMessage({
				channel: channelId,
				ts: finalTs,
				text: `${finalText}\n\n:warning: _The ${outputName} could not be generated. See the thread for details._`,
			}),
			postGenerationError(channelId, ts, {
				outputName,
				// Planning failures happen before any video model is tried.
				models: triedModels.length ? triedModels : [mediaModels[0]],
				message: getErrorMessage(error),
			}),
		]);
		throw error;
	}

	// Remove the generation status once the file has been uploaded.
	await updateSlackMessage({
		channel: channelId,
		ts: finalTs,
		text: finalText,
	});

	// Slack's file broadcast works for both images and videos.
	await broadcastStoryboardImage(channelId, ts, fileId);
}
