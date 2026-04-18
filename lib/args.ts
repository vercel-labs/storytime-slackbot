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
	thinkingEmoji: string;
	panels: number | null;
	/**
	 * Deployment ID to target when starting the workflow. Used by the
	 * command route when calling `start()` so that slash-command
	 * invocations can be routed to a specific preview deployment (useful
	 * for testing workflow changes from a branch). When `null`, the
	 * workflow runtime infers the deployment from environment variables
	 * (default Vercel behavior).
	 */
	deploymentId: string | null;
}

export function parseStorytimeArgs(argv: string[]): StorytimeArgs {
	const args = arg(
		{
			"--model": String,
			"--image-model": String,
			"--image-style": String,
			"--theme": [String],
			"--thinking-emoji": String,
			"--panels": Number,
			"--deployment-id": String,

			// Aliases
			"-m": "--model",
			"-i": "--image-model",
			"-s": "--image-style",
			"-t": "--theme",
			"-e": "--thinking-emoji",
			"-p": "--panels",
			"-d": "--deployment-id",
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

	// Normalize `--deployment-id` (empty string -> null)
	const rawDeploymentId = args["--deployment-id"]?.trim();
	const deploymentId = rawDeploymentId ? rawDeploymentId : null;

	return {
		themes,
		model: args["--model"] || "anthropic/claude-haiku-4.5",
		imageModel: args["--image-model"] || "google/gemini-3-pro-image",
		imageStyle: args["--image-style"] || "",
		thinkingEmoji: args["--thinking-emoji"] || "thinking_face",
		panels,
		deploymentId,
	};
}
