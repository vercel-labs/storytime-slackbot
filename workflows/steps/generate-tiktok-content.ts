import { generateText, type ModelMessage, Output } from "ai";
import { z } from "zod";

const TikTokPostSchema = z.object({
	type: z.enum(["educational", "relatable", "storytelling"]),
	hook: z.string().describe("Scroll-stopping hook for first 0.5 seconds"),
	script: z.array(z.string()).describe("Script outline as bullet points"),
	caption: z.string().describe("Engaging caption for the post"),
	hashtags: z.array(z.string()).describe("Relevant hashtags with # prefix"),
	music: z.string().describe("Music or sound suggestion"),
	visualNotes: z.string().describe("Notes for filming/editing"),
	imagePrompt: z.string().describe("Detailed prompt for generating a vertical 9:16 TikTok thumbnail/cover image with bold text overlay, eye-catching visuals"),
});

const TikTokContentSchema = z.object({
	posts: z.array(TikTokPostSchema).describe("Array of TikTok post ideas"),
});

export async function generateTikTokContent(
	messages: ModelMessage[],
	model: string,
) {
	"use step";

	console.log("Generating TikTok content...");
	console.time("TikTok generation");

	const result = await generateText({
		model,
		messages,
		experimental_output: Output.object({
			schema: TikTokContentSchema,
		}),
		experimental_telemetry: { isEnabled: true },
	});

	console.timeEnd("TikTok generation");
	return result.experimental_output;
}
