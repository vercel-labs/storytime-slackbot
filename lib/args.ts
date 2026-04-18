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
}

/**
 * Extract only the `--deployment-id` / `-d` flag from the argv, ignoring
 * everything else.
 *
 * This runs in the API route BEFORE `start()` is called, so that a
 * slash-command invocation can be routed to a specific (e.g. preview)
 * deployment. The full arg parsing then happens inside the workflow on
 * the target deployment — that way, if the preview deployment adds or
 * changes flags, those changes are parsed by the deployment that
 * actually understands them (rather than by whichever deployment
 * happens to be handling the HTTP request).
 *
 * Permissive mode is used so unknown flags (which the target deployment
 * may understand) don't cause parsing to fail here.
 */
export function parseDeploymentId(argv: string[]): string | undefined {
	try {
		const args = arg(
			{
				"--deployment-id": String,
				"-d": "--deployment-id",
			},
			{ argv, permissive: true },
		);
		return args["--deployment-id"]?.trim() || undefined;
	} catch {
		// If even permissive parsing fails (malformed input), fall back to
		// no deployment override — the workflow's stricter parser will
		// surface the error to the user.
		return undefined;
	}
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
			// Accepted but ignored here — `--deployment-id` is consumed
			// by the API route before `start()` and must not affect
			// workflow behavior. Registered so it doesn't trigger an
			// "unknown flag" error from `arg`.
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

	return {
		themes,
		model: args["--model"] || "anthropic/claude-haiku-4.5",
		imageModel: args["--image-model"] || "google/gemini-3-pro-image",
		imageStyle: args["--image-style"] || "",
		thinkingEmoji: args["--thinking-emoji"] || "thinking_face",
		panels,
	};
}
