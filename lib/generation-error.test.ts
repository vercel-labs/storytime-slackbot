import { describe, expect, it } from "vitest";
import {
	fallbackNoticeMessage,
	generationErrorMessage,
	getErrorMessage,
} from "./generation-error";

describe("getErrorMessage", () => {
	it("prefers the original error over the retry wrapper", () => {
		const error = Object.assign(
			new Error('Step "step//x" failed after 3 retries: wrapped'),
			{ cause: new Error("original") },
		);
		expect(getErrorMessage(error)).toBe("original");
	});

	it("strips the retry prefix when there is no cause", () => {
		expect(
			getErrorMessage(new Error('Step "step//x" failed after 1 retry: boom')),
		).toBe("boom");
	});

	it("handles non-Error values", () => {
		expect(getErrorMessage("boom")).toBe("boom");
		expect(getErrorMessage(new Error(""))).toBe("Unknown error");
	});
});

describe("fallbackNoticeMessage", () => {
	it("names the failed and next models", () => {
		expect(
			fallbackNoticeMessage({
				outputName: "storyboard image",
				model: "spacexai/grok-imagine-image-2.0",
				nextModel: "google/gemini-3-pro-image",
				message: "imagine:content-moderated: rejected <by> moderation",
			}),
		).toEqual({
			text: "spacexai/grok-imagine-image-2.0 couldn't generate the storyboard image (imagine:content-moderated: rejected <by> moderation). Trying google/gemini-3-pro-image…",
			blocks: [
				{
					type: "context",
					elements: [
						{
							type: "mrkdwn",
							text: ":arrows_counterclockwise: `spacexai/grok-imagine-image-2.0` couldn't generate the storyboard image: imagine:content-moderated: rejected &lt;by&gt; moderation\nTrying `google/gemini-3-pro-image` instead…",
						},
					],
				},
			],
		});
	});
});

describe("generationErrorMessage", () => {
	const details = {
		outputName: "storyboard image",
		models: ["spacexai/grok-imagine-image-2.0"],
		message:
			"imagine:content-moderated: Generated image rejected by content moderation.",
		runId: "wrun_123",
	};

	it("formats the error with a linked workflow run", () => {
		const url =
			"https://vercel.com/team/project/workflows/runs/wrun_123?environment=production";
		expect(generationErrorMessage({ ...details, runUrl: url })).toEqual({
			text: `⚠️ The storyboard image could not be generated: ${details.message}`,
			blocks: [
				{
					type: "section",
					text: {
						type: "mrkdwn",
						text: ":warning: *The storyboard image could not be generated*\nThe model's content moderation rejected it. Try a different visual style or model. Run `/storytime` to start a new story.",
					},
				},
				{
					type: "rich_text",
					elements: [
						{
							type: "rich_text_preformatted",
							elements: [{ type: "text", text: details.message }],
						},
					],
				},
				{
					type: "context",
					elements: [
						{
							type: "mrkdwn",
							text: `Model: \`spacexai/grok-imagine-image-2.0\` · Workflow run: <${url}|wrun_123>`,
						},
					],
				},
			],
		});
	});

	it("lists every model tried", () => {
		const { blocks } = generationErrorMessage({
			...details,
			models: ["a/one", "b/two", "c/three"],
		});
		expect(JSON.stringify(blocks.at(-1))).toContain(
			"Models tried: `a/one`, `b/two`, `c/three`",
		);
	});

	it("shows the run ID without a link when the URL is unknown", () => {
		const { blocks } = generationErrorMessage(details);
		expect(JSON.stringify(blocks.at(-1))).toContain("Workflow run: `wrun_123`");
	});

	it("escapes the model and truncates long messages", () => {
		const { blocks } = generationErrorMessage({
			...details,
			outputName: "story video",
			models: ["a<b>&c"],
			message: "x".repeat(3000),
		});
		expect(JSON.stringify(blocks)).toContain("a&lt;b&gt;&amp;c");
		expect(JSON.stringify(blocks)).toContain("Something went wrong");
		const [, richText] = blocks as [
			unknown,
			{ elements: [{ elements: [{ text: string }] }] },
		];
		expect(richText.elements[0].elements[0].text).toHaveLength(2500);
	});
});
