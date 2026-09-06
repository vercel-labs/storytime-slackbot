import type { ModelMessage } from "ai";
import { MockLanguageModelV4, MockProviderV4 } from "ai/test";
import { afterEach, expect, it, vi } from "vitest";
import { SYSTEM_PROMPT } from "../../lib/prompt";
import { generateStoryPiece } from "./generate-story-piece";

afterEach(() => vi.unstubAllGlobals());

it.each([false, true])(
	"uses AI SDK 7 instructions and structured output with transcripts=%s",
	async (transcripts) => {
		const output = {
			done: false,
			encouragement: "What happened next?",
			story: "A pirate sailed among the stars.",
		};
		const model = new MockLanguageModelV4({
			doGenerate: {
				content: [{ type: "text", text: JSON.stringify(output) }],
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
			new MockProviderV4({
				languageModels: { "test-model": model },
			}),
		);
		const instructions = SYSTEM_PROMPT(["Pirates", "Space"]);
		const messages: ModelMessage[] = [
			{ role: "user", content: "Start a story." },
		];

		await expect(
			generateStoryPiece(messages, "test-model", instructions, transcripts),
		).resolves.toEqual(output);
		messages.push(
			{ role: "assistant", content: output.story },
			{ role: "user", content: "They found treasure on the moon." },
		);
		await expect(
			generateStoryPiece(messages, "test-model", instructions, transcripts),
		).resolves.toEqual(output);

		expect(model.doGenerateCalls).toHaveLength(2);
		for (const call of model.doGenerateCalls) {
			expect(call.prompt[0]).toMatchObject({
				role: "system",
				content: instructions,
			});
			expect(
				call.prompt.slice(1).every((message) => message.role !== "system"),
			).toBe(true);
			expect(call.providerOptions).toEqual(
				transcripts
					? { gateway: { transcripts: { enabled: true } } }
					: undefined,
			);
		}
	},
);
