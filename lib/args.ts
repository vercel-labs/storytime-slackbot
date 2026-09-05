import arg from "arg";
import { THEMES } from "./prompt";

// Number of panels in the final storyboard image.
// When `panels` is `null`, the prompt falls back to the original
// "4 to 5" range (the historical default).
export const MIN_PANELS = 2;
export const MAX_PANELS = 12;

export interface StorytimeArgs {
	themes: string[];
	model: string;
	imageModel: string;
	imageStyle: string;
	video: boolean;
	videoModel: string;
	videoDuration?: number;
	thinkingEmoji: string;
	panels: number | null;
}

export function parseStorytimeArgs(argv: string[]): StorytimeArgs {
	const args = arg(
		{
			"--model": String,
			"--image-model": String,
			"--image-style": String,
			"--video": Boolean,
			"--video-model": String,
			"--video-duration": Number,
			"--theme": [String],
			"--thinking-emoji": String,
			"--panels": Number,

			// Aliases
			"-m": "--model",
			"-i": "--image-model",
			"-s": "--image-style",
			"-t": "--theme",
			"-e": "--thinking-emoji",
			"-p": "--panels",
		},
		{ argv },
	);

	// Build themes array - default to 2 random themes if fewer than 2 provided
	const themes = [...(args["--theme"] || [])];
	while (themes.length < 2) {
		themes.push(THEMES[Math.floor(Math.random() * THEMES.length)]);
	}

	// Validate & clamp `--panels` if provided
	let panels: number | null = null;
	const rawPanels = args["--panels"];
	if (rawPanels !== undefined) {
		if (!Number.isFinite(rawPanels) || !Number.isInteger(rawPanels)) {
			throw new Error(
				`--panels must be an integer between ${MIN_PANELS} and ${MAX_PANELS}`,
			);
		}
		if (rawPanels < MIN_PANELS || rawPanels > MAX_PANELS) {
			throw new Error(
				`--panels must be between ${MIN_PANELS} and ${MAX_PANELS} (got ${rawPanels})`,
			);
		}
		panels = rawPanels;
	}

	const videoDuration = args["--video-duration"];
	if (
		videoDuration !== undefined &&
		(!Number.isFinite(videoDuration) || videoDuration <= 0)
	) {
		throw new Error("--video-duration must be a positive number of seconds");
	}

	return {
		themes,
		model: args["--model"] || "anthropic/claude-haiku-4.5",
		imageModel: args["--image-model"] || "google/gemini-3-pro-image",
		imageStyle: args["--image-style"] || "",
		video: args["--video"] ?? false,
		videoModel: args["--video-model"] || "google/veo-3.1-generate-001",
		videoDuration,
		thinkingEmoji: args["--thinking-emoji"] || "thinking_face",
		panels,
	};
}
