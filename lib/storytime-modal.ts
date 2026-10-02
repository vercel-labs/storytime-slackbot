import type { ViewsOpenArguments } from "@slack/web-api";
import { z } from "zod";
import {
	MAX_PANELS,
	MIN_PANELS,
	parseStorytimeArgs,
	type StorytimeArgs,
} from "./args";
import { modelOption } from "./model-catalog";

export const STORYTIME_MODAL_CALLBACK = "storytime_config";
export const storytimeModalContextSchema = z.object({
	channelId: z.string().min(1),
	userId: z.string().min(1),
	teamId: z.string().min(1),
	media: z
		.object({
			image_model: z.string(),
			panels: z.string(),
			video_model: z.string(),
			video_duration: z.string(),
		})
		.optional(),
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

// Reads a text input's value or a select's selected option.
const fieldValue = (
	values: z.infer<typeof storytimeModalStateSchema>,
	id: string,
) =>
	values[id]?.value?.value ?? values[id]?.value?.selected_option?.value ?? "";

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
// Slack has no combobox element. Instead, an external select loads options
// from the interactions endpoint and always offers the typed text first.
const modelSelect = (id: string, label: string, value: string, hint: string) => ({
	type: "input" as const,
	block_id: id,
	label: text(label),
	hint: text(hint),
	element: {
		type: "external_select" as const,
		action_id: "value",
		min_query_length: 0,
		placeholder: text("Search or enter a model ID"),
		...(value ? { initial_option: modelOption(value) } : {}),
	},
});

export function buildStorytimeModal(
	args: StorytimeArgs,
	context: z.infer<typeof storytimeModalContextSchema>,
	values: z.infer<typeof storytimeModalStateSchema> = {},
): Extract<ViewsOpenArguments["view"], { type: "modal" }> {
	const value = (id: string, fallback: string) =>
		id in values ? fieldValue(values, id) : fallback;
	const video =
		(values.output?.value?.selected_option?.value ??
			(args.video ? "video" : "image")) === "video";
	// Only mode-specific fields need storage: shared inputs stay in Slack's view state.
	const media = {
		image_model: value(
			"image_model",
			context.media?.image_model ?? args.imageModel,
		),
		panels:
			values.panels?.value?.selected_option?.value ??
			context.media?.panels ??
			String(args.panels ?? "auto"),
		video_model: value(
			"video_model",
			context.media?.video_model ?? args.videoModel,
		),
		video_duration: value(
			"video_duration",
			context.media?.video_duration ?? String(args.videoDuration ?? ""),
		),
	};
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
	const mediaBlocks: ViewsOpenArguments["view"]["blocks"] = video
		? [
				{ type: "header", text: text("Video settings") },
				modelSelect(
					"video_model",
					"Video model",
					media.video_model,
					"Must support asynchronous generation with webhooks.",
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
						...(media.video_duration
							? { initial_value: media.video_duration }
							: {}),
					},
				},
			]
		: [
				{ type: "header", text: text("Image settings") },
				modelSelect(
					"image_model",
					"Image model",
					media.image_model,
					"An AI Gateway model that outputs images.",
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
							panels.find((item) => item.value === media.panels) ?? panels[0],
					},
				},
			];
	return {
		type: "modal",
		callback_id: STORYTIME_MODAL_CALLBACK,
		private_metadata: JSON.stringify({ ...context, media }),
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
				dispatch_action: true,
				label: text("Final output"),
				element: {
					type: "radio_buttons",
					action_id: "value",
					options: outputs,
					initial_option: outputs[video ? 1 : 0],
				},
			},
			textInput(
				"themes",
				"Themes",
				value("themes", args.themes.join("\n")),
				true,
				"One theme per line. Random themes fill any missing slots up to two.",
				true,
			),
			textInput(
				"style",
				"Visual style",
				value("style", args.style),
				true,
				"Applies to both modes. For example: watercolor, pencil sketch, or claymation. Leave blank for the default storybook style.",
			),
			modelSelect(
				"model",
				"Story model",
				value("model", args.model),
				"An AI Gateway language model.",
			),
			...mediaBlocks,
			{ type: "header", text: text("Session settings") },
			textInput(
				"thinking_emoji",
				"Thinking emoji",
				value("thinking_emoji", args.thinkingEmoji),
				false,
				"Slack emoji name without colons, such as thinking_face.",
			),
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
	const value = (id: string) => fieldValue(values, id).trim();
	const output = values.output?.value?.selected_option?.value;
	if (output !== "image" && output !== "video")
		errors.output = "Choose image or video output.";
	if (output === "video") argv.push("--video");
	for (const [id, flag] of [
		["model", "--model"],
		output === "video"
			? ["video_model", "--video-model"]
			: ["image_model", "--image-model"],
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
	if (output === "image") {
		const panels = values.panels?.value?.selected_option?.value;
		if (!panels) errors.panels = "Choose the number of panels.";
		else if (panels !== "auto") argv.push(`--panels=${panels}`);
	} else if (output === "video" && value("video_duration")) {
		argv.push(`--video-duration=${value("video_duration")}`);
	}
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
