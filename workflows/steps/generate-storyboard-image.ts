import { generateText } from "ai";
import { FatalError } from "workflow";
import { IMAGE_GEN_PROMPT } from "@/lib/prompt";
import { slack } from "@/lib/slack";

export async function generateStoryboardImage(
	channelId: string,
	threadTs: string,
	finalStory: string,
	imageModel: string,
	style: string,
	panels: number | null = null,
	transcripts = false,
): Promise<string | null> {
	"use step";

	console.time("Generating storyboard image");
	const result = await generateText({
		model: imageModel,
		prompt: IMAGE_GEN_PROMPT(finalStory, style, panels),
		providerOptions: transcripts
			? { gateway: { transcripts: { enabled: true } } }
			: undefined,
	});
	console.timeEnd("Generating storyboard image");

	// Check if the model returned any image files
	const imageFile = result.files?.[0];
	if (!imageFile?.uint8Array) {
		console.warn(
			`Image generation failed: model "${imageModel}" did not return any image files`,
		);
		await slack.chat.postMessage({
			channel: channelId,
			thread_ts: threadTs,
			text: `⚠️ Image generation failed: the model \`${imageModel}\` does not support image generation.`,
		});
		return null;
	}

	console.time("Uploading image to Slack");
	const res = await slack.files.uploadV2({
		channel_id: channelId,
		thread_ts: threadTs,
		file: Buffer.from(imageFile.uint8Array),
		filename: "storyboard.png",
		title: "Storyboard",
	});
	console.timeEnd("Uploading image to Slack");

	if (!res.ok) {
		throw new FatalError(`Failed to upload file: ${res.error}`);
	}

	// @ts-expect-error - files is not typed
	return res.files[0].files[0].id as string;
}

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
