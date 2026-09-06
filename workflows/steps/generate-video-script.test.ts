import { MockLanguageModelV4, MockProviderV4 } from "ai/test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { VIDEO_GEN_PROMPT } from "../../lib/prompt";
import { generateVideoScript } from "./generate-video-script";

const story =
	"Nina lost her lantern. A fox helped her find it, and they returned home together.";
const plan = {
	characters:
		"Nina wears a blue coat; the fox has an orange coat and white tail tip.",
	setup: "Nina looks for her missing lantern beside a dark path.",
	action: "The fox leads Nina to the lantern under a tree.",
	resolution: "Nina lifts the lantern and returns home with the fox.",
	finalFrame: "Hold on Nina and the fox together in the warm doorway.",
};
let model: MockLanguageModelV4;

beforeEach(() => {
	model = new MockLanguageModelV4({
		doGenerate: {
			content: [{ type: "text", text: JSON.stringify(plan) }],
			finishReason: { unified: "stop", raw: undefined },
			usage: {
				inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
				outputTokens: { total: 10, text: 10, reasoning: 0 },
			},
			warnings: [],
		},
	});
	vi.stubGlobal(
		"AI_SDK_DEFAULT_PROVIDER",
		new MockProviderV4({ languageModels: { "test-model": model } }),
	);
});

afterEach(() => vi.unstubAllGlobals());

it.each([
	{ duration: 8, ranges: ["0s-2s", "2s-5s", "5s-7s", "7s-8s"] },
	{ duration: 4, ranges: ["0s-1s", "1s-2.5s", "2.5s-3.5s", "3.5s-4s"] },
	{
		duration: 2.5,
		ranges: ["0s-0.625s", "0.625s-1.5625s", "1.5625s-2.1875s", "2.1875s-2.5s"],
	},
	{
		duration: undefined,
		ranges: ["0%-25%", "25%-62.5%", "62.5%-87.5%", "87.5%-100%"],
	},
])(
	"builds a complete timing budget for duration=$duration",
	async ({ duration, ranges }) => {
		const script = await generateVideoScript(
			story,
			"test-model",
			"watercolor",
			duration,
		);
		for (const range of ranges) expect(script).toContain(range);
		expect(script).toContain(`Character continuity: ${plan.characters}`);
		expect(script).toContain(`Resolution: ${plan.resolution}`);
		expect(script).toContain(
			`Final hold (no new action or speech): ${plan.finalFrame}`,
		);
		const request = model.doGenerateCalls[0];
		expect(request.prompt[0]).toMatchObject({
			role: "system",
			content: expect.stringContaining("Visual style: watercolor"),
		});
		expect(request.prompt[0]).toMatchObject({
			content: expect.stringContaining("preserving the source story's outcome"),
		});
		expect(request.prompt[1]).toMatchObject({
			role: "user",
			content: [{ type: "text", text: story }],
		});
		if (duration === undefined) {
			expect(script).toContain("default clip duration");
			expect(script).not.toContain("Total clip duration:");
		} else {
			expect(script).toContain(`Total clip duration: ${duration} seconds.`);
		}

		const prompt = VIDEO_GEN_PROMPT(script, "watercolor");
		expect(prompt).toContain(script);
		expect(prompt).toContain("Show the resolution before the final hold");
		expect(prompt).toContain(
			"Do not add scenes, dialogue, or narration beyond the script",
		);
		expect(prompt).not.toContain(story);
	},
);

it.each([false, true])(
	"honors the transcripts opt-in: %s",
	async (transcripts) => {
		await generateVideoScript(story, "test-model", "", 8, transcripts);
		expect(model.doGenerateCalls[0].providerOptions).toEqual(
			transcripts ? { gateway: { transcripts: { enabled: true } } } : undefined,
		);
	},
);
