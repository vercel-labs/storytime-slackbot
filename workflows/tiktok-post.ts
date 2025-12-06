import type { ModelMessage } from "ai";
import { defineHook, FatalError } from "workflow";
import { tiktokFeedbackToken } from "@/lib/hook-tokens";
import { generateTikTokContent } from "./steps/generate-tiktok-content";
import { generateAndPostTikTokImage } from "./steps/generate-tiktok-image";
import { postSlackMessage, updateSlackMessage } from "./steps/post-slack-message";

// Hook for feedback messages in thread
export const tiktokFeedbackHook = defineHook<{
	text: string;
	ts: string;
}>();

// v4 - iterative feedback loop (runs forever until user stops)
const TIKTOK_SYSTEM_PROMPT = `You are a TikTok content strategist and creator.

Generate viral, engaging TikTok post ideas based on current trends and the given topic.

For each post, provide:
1. A scroll-stopping hook (first 0.5 seconds)
2. A brief script outline (3-6 bullet points)
3. An engaging caption
4. Relevant hashtags (5-8, mix of trending and niche)
5. Music/sound suggestion
6. Visual notes for filming
7. An image prompt describing a scroll-stopping thumbnail/cover image for this TikTok

Focus on:
- Authenticity over perfection
- Value-first content (educate, entertain, or inspire)
- Clear call-to-action
- Trending formats when relevant

Keep the tone conversational and Gen-Z friendly without being cringe.`;

// Helper to format posts for Slack
function formatPosts(posts: any[]): string {
	return posts
		.map(
			(post, i) =>
				`*POST ${i + 1}: ${post.type.toUpperCase()}*\n` +
				`> :movie_camera: *Hook:* ${post.hook}\n\n` +
				`*Script:*\n${post.script.map((s: string) => `- ${s}`).join("\n")}\n\n` +
				`*Caption:*\n${post.caption}\n\n` +
				`*Hashtags:* ${post.hashtags.join(" ")}\n` +
				`*Music:* ${post.music}\n` +
				`*Visual notes:* ${post.visualNotes}`,
		)
		.join("\n\n---\n\n");
}

export async function tiktokPost(slashCommand: URLSearchParams) {
	"use workflow";

	const channelId = slashCommand.get("channel_id");
	const topic = slashCommand.get("text") || "AI tools and productivity";

	if (!channelId) {
		throw new FatalError("`channel_id` is required");
	}

	const model = "anthropic/claude-sonnet-4";

	// Conversation history for iterative refinement
	const messages: ModelMessage[] = [
		{ role: "system", content: TIKTOK_SYSTEM_PROMPT },
		{
			role: "user",
			content: `Generate 3 TikTok post ideas about: "${topic}"

Consider current trends and what performs well. Make them diverse:
1. One educational/value post
2. One relatable/entertainment post
3. One storytelling/personal post

For each post, include an imagePrompt field with a detailed description for generating a vertical 9:16 TikTok thumbnail/cover image.`,
		},
	];

	const { ts } = await postSlackMessage({
		channel: channelId,
		text: `Generating TikTok content for: *${topic}*\n\n_Working on it..._ :thinking_face:`,
	});

	// Initial generation
	let content = await generateTikTokContent(messages, model);
	let iteration = 1;

	// Add assistant response to history
	messages.push({
		role: "assistant",
		content: JSON.stringify(content),
	});

	// Update with text content
	let formattedPosts = formatPosts(content.posts);

	await updateSlackMessage({
		channel: channelId,
		ts,
		text: `*TikTok Content for:* ${topic}\n\n${formattedPosts}\n\n_Generating images..._ :art:`,
	});

	// Generate initial images
	for (let i = 0; i < content.posts.length; i++) {
		const post = content.posts[i];
		const imagePrompt = post.imagePrompt || `${post.hook}. ${post.visualNotes}`;
		await generateAndPostTikTokImage(channelId, ts, imagePrompt, post.type, i + 1);
	}

	// Update with feedback prompt
	await updateSlackMessage({
		channel: channelId,
		ts,
		text: `*TikTok Content for:* ${topic}\n\n${formattedPosts}\n\n:white_check_mark: *Images in thread*\n\n_Reply in thread with feedback to refine, or leave as-is!_`,
	});

	// Create hook to listen for feedback in this thread
	const feedbackHook = tiktokFeedbackHook.create({
		token: tiktokFeedbackToken(channelId, ts),
	});

	// Infinite loop - process feedback forever
	for await (const feedback of feedbackHook) {
		iteration++;
		console.log(`Iteration ${iteration}: Processing feedback: ${feedback.text}`);

		// Add user feedback to conversation
		messages.push({
			role: "user",
			content: feedback.text,
		});

		// Post thinking indicator
		await postSlackMessage({
			channel: channelId,
			thread_ts: ts,
			text: `_Refining based on your feedback..._ :thinking_face:`,
		});

		// Regenerate with feedback
		content = await generateTikTokContent(messages, model);

		// Add to history
		messages.push({
			role: "assistant",
			content: JSON.stringify(content),
		});

		// Update main message
		formattedPosts = formatPosts(content.posts);
		await updateSlackMessage({
			channel: channelId,
			ts,
			text: `*TikTok Content for:* ${topic} _(v${iteration})_\n\n${formattedPosts}\n\n_Generating new images..._ :art:`,
		});

		// Generate new images
		for (let i = 0; i < content.posts.length; i++) {
			const post = content.posts[i];
			const imagePrompt = post.imagePrompt || `${post.hook}. ${post.visualNotes}`;
			await generateAndPostTikTokImage(channelId, ts, imagePrompt, post.type, i + 1);
		}

		// Ready for more feedback
		await updateSlackMessage({
			channel: channelId,
			ts,
			text: `*TikTok Content for:* ${topic} _(v${iteration})_\n\n${formattedPosts}\n\n:white_check_mark: *Images in thread*\n\n_Reply with more feedback or leave as-is!_`,
		});
	}
}
