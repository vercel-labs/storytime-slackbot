import { generateText, type ModelMessage, Output } from "ai";
import { z } from "zod";

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

export async function generateStoryPiece(
	messages: ModelMessage[],
	model: string,
	transcripts = false,
) {
	"use step";

	// Debugging
	console.log(JSON.stringify(messages, null, 2));

	console.time("Generating story piece");
	const result = await generateText({
		model,
		messages,
		providerOptions: transcripts
			? { gateway: { transcripts: { enabled: true } } }
			: undefined,
		experimental_output: Output.object({
			schema: StoryPieceSchema,
		}),
		experimental_telemetry: { isEnabled: true },
	});
	console.timeEnd("Generating story piece");

	return result.experimental_output;
}
