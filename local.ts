import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

import { generateText, type ModelMessage, Output } from "ai";
import terminalImage from "terminal-image";
import { z } from "zod";
import { parseStorytimeArgs } from "./lib/args.ts";
import { IMAGE_GEN_PROMPT, SYSTEM_PROMPT } from "./lib/prompt.ts";
import { createReadlineIterator } from "./readline.ts";

const userInput = createReadlineIterator("Enter your story piece: ");

const { themes, model, imageModel, imageStyle, panels } = parseStorytimeArgs(
	process.argv.slice(2),
);
console.log(`Themes: ${themes.join(", ")}`);
console.log(`Model: ${model}`);
console.log(`Image Model: ${imageModel}`);
if (imageStyle) console.log(`Image Style: ${imageStyle}`);
if (panels != null) console.log(`Panels: ${panels}`);

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

const StorytimeSchema = z.object({
	done: z.boolean(),
	encouragement: z.string(),
	story: z.string(),
});

let finalStory = "";

// Generate the opening of the story before reading any user input
const opening = await generateText({
	model,
	messages,
	experimental_output: Output.object({ schema: StorytimeSchema }),
});
console.log(opening.experimental_output);
messages.push({ role: "assistant", content: opening.text });

for await (const data of userInput) {
	messages.push({ role: "user", content: data.text });

	const result = await generateText({
		model,
		messages,
		experimental_output: Output.object({
			schema: StorytimeSchema,
		}),
	});
	console.log(result.experimental_output);

	messages.push({
		role: "assistant",
		content: result.text,
	});

	if (result.experimental_output?.done) {
		finalStory = result.experimental_output.story;
		break;
	}
}

console.log("");
console.log("Here is the final story:");
console.log(finalStory);

const result = await generateText({
	model: imageModel,
	prompt: IMAGE_GEN_PROMPT(finalStory, imageStyle, panels),
});

console.log(await terminalImage.buffer(result.files[0].uint8Array));
