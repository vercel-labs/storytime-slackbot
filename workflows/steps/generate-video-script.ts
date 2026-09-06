import { generateText, Output } from "ai";
import { z } from "zod";

export async function generateVideoScript(
	finalStory: string,
	model: string,
	style = "",
	duration?: number,
	transcripts = false,
): Promise<string> {
	"use step";

	const times = [0, 0.25, 0.625, 0.875, 1].map((fraction) =>
		duration === undefined
			? `${fraction * 100}%`
			: `${Number((duration * fraction).toPrecision(8))}s`,
	);
	const budget =
		duration === undefined
			? "Use the video model's default clip duration. Timings are percentages of that duration."
			: `Total clip duration: ${duration} seconds.`;
	const { output } = await generateText({
		model,
		instructions: `Adapt the source story into a complete, tightly paced animated children's storybook video script.
${budget}
Visual style: ${style || "colorful storybook illustrations"}.

Use exactly these four time slots:
- ${times[0]}-${times[1]}: Establish the main characters and situation immediately.
- ${times[1]}-${times[2]}: Show the central action or conflict.
- ${times[2]}-${times[3]}: Show the resolution explicitly, preserving the source story's outcome.
- ${times[3]}-${times[4]}: Hold the resolved final image. No new action, dialogue, or plot developments.

This is a complete miniature adaptation, not a trailer or the opening of a longer story.
Preserve the main characters, the cause-and-effect of the central events, and the ending.
Omit secondary details rather than rushing or leaving the conflict unresolved.
Keep each beat visually simple enough for its allotted time, especially for a short default-duration clip.
Keep character names and appearances consistent across all beats.
Prefer visual storytelling. If speech is essential, use only a few complete words that comfortably fit inside a beat.
Do not narrate the full source text or include on-screen text. All action and speech must finish before the final hold.
Return concrete screen directions, not a retelling of the source prose.`,
		prompt: finalStory,
		output: Output.object({
			schema: z.object({
				characters: z
					.string()
					.min(1)
					.describe(
						"Names and consistent visual descriptions of the main characters",
					),
				setup: z
					.string()
					.min(1)
					.describe("The opening situation in one simple visual beat"),
				action: z
					.string()
					.min(1)
					.describe("The main action or conflict in one simple visual beat"),
				resolution: z
					.string()
					.min(1)
					.describe("A visible resolution that preserves the original ending"),
				finalFrame: z
					.string()
					.min(1)
					.describe(
						"The resolved final image to hold, with no new action or speech",
					),
			}),
		}),
		providerOptions: transcripts
			? { gateway: { transcripts: { enabled: true } } }
			: undefined,
		experimental_telemetry: { isEnabled: true },
	});

	// Assign timing here rather than trusting the model to produce a complete schedule.
	return `${budget}
Character continuity: ${output.characters}

${times[0]}-${times[1]} | Setup: ${output.setup}
${times[1]}-${times[2]} | Main action: ${output.action}
${times[2]}-${times[3]} | Resolution: ${output.resolution}
${times[3]}-${times[4]} | Final hold (no new action or speech): ${output.finalFrame}`;
}
