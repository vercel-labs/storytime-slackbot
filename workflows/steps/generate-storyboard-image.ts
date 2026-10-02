import { FatalError, getStepMetadata } from "workflow";
import {
	FALLBACK_COUNT,
	IMAGE_FALLBACK_MODELS,
	withFallbacks,
} from "@/lib/fallback-models";
import { generateImageFile } from "@/lib/generate-image";
import {
	fallbackNoticeMessage,
	getErrorMessage,
} from "@/lib/generation-error";
import { IMAGE_GEN_PROMPT } from "@/lib/prompt";
import { slack } from "@/lib/slack";

const IMAGE_EXTENSIONS: Record<string, string> = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/webp": "webp",
	"image/gif": "gif",
};

export async function generateStoryboardImage(
	channelId: string,
	threadTs: string,
	finalStory: string,
	imageModel: string,
	style: string,
	panels: number | null = null,
	transcripts = false,
): Promise<string> {
	"use step";

	// Each retry uses the next fallback model (see `maxRetries` below).
	const models = withFallbacks(imageModel, IMAGE_FALLBACK_MODELS);
	const { attempt } = getStepMetadata();
	const model = models[Math.min(attempt, models.length) - 1];

	console.time(`Generating storyboard image with ${model}`);
	let imageFile: Awaited<ReturnType<typeof generateImageFile>>;
	try {
		imageFile = await generateImageFile({
			model,
			prompt: IMAGE_GEN_PROMPT(finalStory, style, panels),
			providerOptions: transcripts
				? { gateway: { transcripts: { enabled: true } } }
				: undefined,
		});
		if (!imageFile?.uint8Array) {
			throw new Error(
				`The model "${model}" did not return an image. It may not support image generation.`,
			);
		}
	} catch (error) {
		// Errors are retried even if permanent (e.g. content moderation), since
		// the retry uses a different model.
		const nextModel = models[attempt];
		if (nextModel) {
			await slack.chat
				.postMessage({
					channel: channelId,
					thread_ts: threadTs,
					...fallbackNoticeMessage({
						outputName: "storyboard image",
						model,
						nextModel,
						message: getErrorMessage(error),
					}),
				})
				.catch((noticeError) => {
					// Don't mask the generation error, which triggers the fallback.
					console.warn("Could not post fallback notice", noticeError);
				});
		}
		throw error;
	} finally {
		console.timeEnd(`Generating storyboard image with ${model}`);
	}

	console.time("Uploading image to Slack");
	const res = await slack.files.uploadV2({
		channel_id: channelId,
		thread_ts: threadTs,
		file: Buffer.from(imageFile.uint8Array),
		// Dedicated image models may return JPEG/WebP rather than PNG.
		filename: `storyboard.${IMAGE_EXTENSIONS[imageFile.mediaType] ?? "png"}`,
		title: "Storyboard",
	});
	console.timeEnd("Uploading image to Slack");

	if (!res.ok) {
		throw new FatalError(`Failed to upload file: ${res.error}`);
	}

	// @ts-expect-error - files is not typed
	return res.files[0].files[0].id as string;
}

// One attempt per model: the selected model, then each fallback.
generateStoryboardImage.maxRetries = FALLBACK_COUNT;

export async function broadcastStoryboardImage(
	channelId: string,
	threadTs: string,
	fileId: string,
) {
	"use step";

	// Fetch replies in the thread
	const replies = await slack.conversations.replies({
		channel: channelId,
		ts: threadTs,
		limit: 200,
		inclusive: true,
	});

	const { messages } = replies;

	if (!replies.ok || !messages || messages.length === 0) {
		throw new FatalError(`Failed to fetch thread replies: ${replies.error}`);
	}

	// Find newest message posted by this bot in the thread
	const messageWithFile = messages.find((m) =>
		m.files?.find((f) => f.id === fileId),
	);

	if (!messageWithFile?.ts) {
		// Non-fatal error, so that this step gets retried
		throw new Error("Failed to find bot message in thread - retrying…");
	}

	// @ts-expect-error - Specifying only `reply_broadcast` is not properly typed
	await slack.chat.update({
		channel: channelId,
		ts: messageWithFile.ts,
		reply_broadcast: true,
	});
}
