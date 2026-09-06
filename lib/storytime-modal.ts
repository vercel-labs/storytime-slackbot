import type { ViewsOpenArguments } from "@slack/web-api";
import { z } from "zod";
import {
	MAX_PANELS,
	MIN_PANELS,
	parseStorytimeArgs,
	type StorytimeArgs,
} from "./args";

export const STORYTIME_MODAL_CALLBACK = "storytime_config";
export const storytimeModalContextSchema = z.object({
	channelId: z.string().min(1),
	userId: z.string().min(1),
	teamId: z.string().min(1),
});
export const storytimeModalStateSchema = z.record(
	z.string(),
	z.record(
		z.string(),
		z.object({
			value: z.string().nullable().optional(),
			selected_option: z.object({ value: z.string() }).nullable().optional(),
			selected_options: z
				.array(z.object({ value: z.string() }))
				.nullable()
				.optional(),
		}),
	),
);

const text = (value: string) => ({ type: "plain_text" as const, text: value });
const option = (label: string, value: string) => ({ text: text(label), value });
const textInput = (
	id: string,
	label: string,
	value: string,
	optional = false,
	hint?: string,
	multiline = false,
) => ({
	type: "input" as const,
	block_id: id,
	label: text(label),
	optional,
	...(hint ? { hint: text(hint) } : {}),
	element: {
		type: "plain_text_input" as const,
		action_id: "value",
		multiline,
		max_length: 3000,
		...(value ? { initial_value: value } : {}),
	},
});

export function buildStorytimeModal(
	args: StorytimeArgs,
	context: z.infer<typeof storytimeModalContextSchema>,
): Extract<ViewsOpenArguments["view"], { type: "modal" }> {
	const outputs = [
		option("Storyboard image", "image"),
		option("Video", "video"),
	];
	const panels = [
		option("Automatic (4-5 panels)", "auto"),
		...Array.from({ length: MAX_PANELS - MIN_PANELS + 1 }, (_, i) =>
			option(`${i + MIN_PANELS} panels`, String(i + MIN_PANELS)),
		),
	];
	const transcripts = option("Record Gateway request transcripts", "enabled");
	return {
		type: "modal",
		callback_id: STORYTIME_MODAL_CALLBACK,
		private_metadata: JSON.stringify(context),
		title: text("Storytime"),
		submit: text("Start Story"),
		close: text("Cancel"),
		blocks: [
			{
				type: "section",
				text: {
					type: "mrkdwn",
					text: `Create a story together in <#${context.channelId}>. Choose how it comes to life at the end.`,
				},
			},
			{
				type: "input",
				block_id: "output",
				label: text("Final output"),
				element: {
					type: "radio_buttons",
					action_id: "value",
					options: outputs,
					initial_option: outputs[args.video ? 1 : 0],
				},
			},
			textInput(
				"themes",
				"Themes",
				args.themes.join("\n"),
				true,
				"One theme per line. Random themes fill any missing slots up to two.",
				true,
			),
			textInput(
				"style",
				"Visual style",
				args.style,
				true,
				"Applies to both modes. For example: watercolor, pencil sketch, or claymation. Leave blank for the default storybook style.",
			),
			textInput(
				"model",
				"Story model",
				args.model,
				false,
				"An AI Gateway model ID.",
			),
			{ type: "header", text: text("Image settings") },
			textInput(
				"image_model",
				"Image model",
				args.imageModel,
				false,
				"Used only for storyboard image output.",
			),
			{
				type: "input",
				block_id: "panels",
				label: text("Storyboard panels"),
				element: {
					type: "static_select",
					action_id: "value",
					options: panels,
					initial_option:
						panels.find((item) => item.value === String(args.panels)) ??
						panels[0],
				},
			},
			{ type: "header", text: text("Video settings") },
			textInput(
				"video_model",
				"Video model",
				args.videoModel,
				false,
				"Used only for video output. Must support asynchronous generation with webhooks.",
			),
			{
				type: "input",
				block_id: "video_duration",
				label: text("Video duration (seconds)"),
				optional: true,
				hint: text(
					"Leave blank for the model's default. Supported durations depend on the model.",
				),
				element: {
					type: "number_input",
					action_id: "value",
					is_decimal_allowed: true,
					min_value: "0",
					...(args.videoDuration !== undefined
						? { initial_value: String(args.videoDuration) }
						: {}),
				},
			},
			{ type: "header", text: text("Session settings") },
			textInput(
				"thinking_emoji",
				"Thinking emoji",
				args.thinkingEmoji,
				false,
				"Slack emoji name without colons, such as thinking_face.",
			),
			{
				type: "input",
				block_id: "transcripts",
				label: text("Transcripts"),
				optional: true,
				hint: text(
					"Records participants' contributions, prompts, files, and outputs. Requires transcripts enabled in your team's AI Gateway settings.",
				),
				element: {
					type: "checkboxes",
					action_id: "value",
					options: [transcripts],
					...(args.transcripts ? { initial_options: [transcripts] } : {}),
				},
			},
		],
	};
}

export function parseStorytimeModal(
	values: z.infer<typeof storytimeModalStateSchema>,
):
	| { args: StorytimeArgs; errors?: never }
	| { errors: Record<string, string>; args?: never } {
	const errors: Record<string, string> = {};
	const argv: string[] = [];
	const value = (id: string) => values[id]?.value?.value?.trim() || "";
	const output = values.output?.value?.selected_option?.value;
	if (output !== "image" && output !== "video")
		errors.output = "Choose image or video output.";
	if (output === "video") argv.push("--video");
	for (const [id, flag] of [
		["model", "--model"],
		["image_model", "--image-model"],
		["video_model", "--video-model"],
		["thinking_emoji", "--thinking-emoji"],
	]) {
		if (!value(id)) errors[id] = "Enter a value.";
		// Equals-form arguments keep custom values beginning with '--' literal.
		argv.push(`${flag}=${value(id)}`);
	}
	for (const theme of value("themes")
		.split("\n")
		.map((theme) => theme.trim())
		.filter(Boolean)) {
		argv.push(`--theme=${theme}`);
	}
	argv.push(`--style=${value("style")}`);
	const panels = values.panels?.value?.selected_option?.value;
	if (!panels) errors.panels = "Choose the number of panels.";
	else if (panels !== "auto") argv.push(`--panels=${panels}`);
	if (value("video_duration"))
		argv.push(`--video-duration=${value("video_duration")}`);
	if (
		values.transcripts?.value?.selected_options?.some(
			(item) => item.value === "enabled",
		)
	)
		argv.push("--transcripts");
	if (Object.keys(errors).length) return { errors };
	try {
		return { args: parseStorytimeArgs(argv) };
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Invalid configuration.";
		return {
			errors: {
				[message.includes("--video-duration") ? "video_duration" : "panels"]:
					message,
			},
		};
	}
}
