import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

import readline from "node:readline/promises";
import { generateText, type ModelMessage, Output } from "ai";
import terminalImage from "terminal-image";
import { z } from "zod";
import { parseStorytimeArgs } from "./lib/args.ts";
import { IMAGE_GEN_PROMPT, SYSTEM_PROMPT } from "./lib/prompt.ts";

const { themes, model, imageModel, imageStyle, panels, video } = parseStorytimeArgs(
	process.argv.slice(2),
);
if (video) {
	throw new Error(
		"--video requires a Workflow runtime. Use /storytime --video in Slack.",
	);
}

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
});
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

while (true) {
	const result = await generateText({
		model,
		messages,
		providerOptions: {
			gateway: { transcripts: { enabled: true } },
		},
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

	// read user input
	console.log("");
	const userInput = await rl.question("Enter your story piece: ");

	messages.push({
		role: "user",
		content: userInput,
	});
}

rl.close();

console.log("");
console.log("Here is the final story:");
console.log(finalStory);

const result = await generateText({
	model: imageModel,
	prompt: IMAGE_GEN_PROMPT(finalStory, imageStyle, panels),
	providerOptions: {
		gateway: { transcripts: { enabled: true } },
	},
});

console.log(await terminalImage.buffer(result.files[0].uint8Array));
