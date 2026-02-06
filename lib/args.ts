import arg from "arg";
import { THEMES } from "./prompt";

export interface StorytimeArgs {
	themes: string[];
	model: string;
	imageModel: string;
	imageStyle: string;
	thinkingEmoji: string;
	useStreaming: boolean;
}

export function parseStorytimeArgs(argv: string[]): StorytimeArgs {
	const args = arg(
		{
			"--model": String,
			"--image-model": String,
			"--image-style": String,
			"--theme": [String],
			"--thinking-emoji": String,
			"--streaming": Boolean,
			"--no-streaming": Boolean,

			// Aliases
			"-m": "--model",
			"-i": "--image-model",
			"-s": "--image-style",
			"-t": "--theme",
			"-e": "--thinking-emoji",
		},
		{ argv },
	);

	// Build themes array - default to 2 random themes if fewer than 2 provided
	const themes = [...(args["--theme"] || [])];
	while (themes.length < 2) {
		themes.push(THEMES[Math.floor(Math.random() * THEMES.length)]);
	}

	// Streaming is enabled by default, can be disabled with --no-streaming
	const useStreaming = args["--no-streaming"] ? false : (args["--streaming"] ?? true);

	return {
		themes,
		model: args["--model"] || "anthropic/claude-haiku-4.5",
		imageModel: args["--image-model"] || "google/gemini-3-pro-image",
		imageStyle: args["--image-style"] || "",
		thinkingEmoji: args["--thinking-emoji"] || "thinking_face",
		useStreaming,
	};
}
