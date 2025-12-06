import { slack } from "@/lib/slack";
import { FatalError } from "workflow";

/**
 * Generate TikTok image and upload to Slack in ONE step.
 * Buffer stays inside step, only file ID returns (serializable).
 * Pattern from vercel-labs/storytime-slackbot.
 */
export async function generateAndPostTikTokImage(
	channelId: string,
	threadTs: string,
	prompt: string,
	postType: string,
	postNumber: number,
): Promise<string> {
	"use step";

	console.log(`Generating TikTok image for: ${postType} (post ${postNumber})`);
	console.time(`Image ${postNumber} total`);

	const enhancedPrompt = `TikTok thumbnail style, vertical 9:16 format, eye-catching social media content, bold colors, high contrast, modern aesthetic. ${prompt}. Clean composition, scroll-stopping visual, trending social media style.`;

	try {
		// Generate image via Replicate HTTP API - Google nano-banana (Gemini Flash)
		console.log(`Generating with nano-banana...`);
		const replicateRes = await fetch(
			"https://api.replicate.com/v1/models/google/nano-banana/predictions",
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
					"Content-Type": "application/json",
					Prefer: "wait",
				},
				body: JSON.stringify({
					input: {
						prompt: enhancedPrompt,
						aspect_ratio: "9:16",
						output_format: "jpg",
					},
				}),
			},
		);

		if (!replicateRes.ok) {
			const errText = await replicateRes.text();
			throw new Error(`Replicate API error ${replicateRes.status}: ${errText}`);
		}

		const result = await replicateRes.json();
		console.log(`Replicate result status: ${result.status}`);

		if (result.status !== "succeeded" || !result.output) {
			throw new Error(`Replicate failed: ${result.error || "no output"}`);
		}

		// nano-banana returns single URL string, not array
		const imageUrl = result.output;
		console.log(`Got image URL: ${imageUrl}`);

		if (!imageUrl || typeof imageUrl !== "string") {
			throw new Error(`Invalid image URL from Replicate`);
		}

		console.log(`Got image URL, fetching binary...`);

		// Fetch the image as binary
		const response = await fetch(imageUrl);
		if (!response.ok) {
			throw new Error(`Failed to fetch image: ${response.status}`);
		}
		const arrayBuffer = await response.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);

		console.log(`Uploading to Slack (${buffer.length} bytes)...`);

		// Upload directly to Slack - buffer stays in this step
		const res = await slack.files.uploadV2({
			channel_id: channelId,
			thread_ts: threadTs,
			file: buffer,
			filename: `tiktok-${postType}-${postNumber}.png`,
			title: `Post ${postNumber}: ${postType.toUpperCase()}`,
		});

		console.timeEnd(`Image ${postNumber} total`);

		if (!res.ok) {
			throw new FatalError(`Failed to upload file: ${res.error}`);
		}

		// @ts-expect-error - files is not typed
		const fileId = res.files[0].files[0].id as string;
		console.log(`Uploaded file ID: ${fileId}`);

		return fileId;
	} catch (error) {
		console.error("Image generation/upload error:", error);
		throw new FatalError(
			`Failed to generate/upload image: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
}
