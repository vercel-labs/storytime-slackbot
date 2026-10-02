import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStepMetadata } from "workflow";
import { generateImageFile } from "@/lib/generate-image";
import { slack } from "@/lib/slack";
import { generateStoryboardImage } from "./generate-storyboard-image";

vi.mock("workflow", () => ({
	FatalError: class FatalError extends Error {},
	getStepMetadata: vi.fn(),
}));
vi.mock("@/lib/generate-image", () => ({ generateImageFile: vi.fn() }));
vi.mock("@/lib/slack", () => ({
	slack: {
		chat: { postMessage: vi.fn() },
		files: { uploadV2: vi.fn() },
	},
}));

const generate = () =>
	generateStoryboardImage(
		"channel",
		"thread",
		"story",
		"spacexai/grok-imagine-image-2.0",
		"",
	);
const attempt = (n: number) =>
	vi.mocked(getStepMetadata).mockReturnValue({ attempt: n } as never);

describe("generateStoryboardImage", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		vi.mocked(slack.chat.postMessage).mockResolvedValue({ ok: true } as never);
		vi.mocked(slack.files.uploadV2).mockResolvedValue({
			ok: true,
			files: [{ files: [{ id: "file" }] }],
		} as never);
		vi.mocked(generateImageFile).mockResolvedValue({
			mediaType: "image/jpeg",
			uint8Array: new Uint8Array([1]),
		} as never);
	});

	it("allows one attempt per model", () => {
		expect(
			(generateStoryboardImage as typeof generateStoryboardImage & {
				maxRetries: number;
			}).maxRetries,
		).toBe(2);
	});

	it.each([
		[1, "spacexai/grok-imagine-image-2.0"],
		[2, "google/gemini-3-pro-image"],
		[3, "openai/gpt-image-2"],
	])("uses the right model on attempt %i", async (n, model) => {
		attempt(n);
		expect(await generate()).toBe("file");
		expect(generateImageFile).toHaveBeenCalledWith(
			expect.objectContaining({ model }),
		);
		expect(slack.files.uploadV2).toHaveBeenCalledWith(
			expect.objectContaining({ filename: "storyboard.jpg" }),
		);
	});

	it("posts a fallback notice and rethrows so the step retries", async () => {
		attempt(1);
		const error = new Error("imagine:content-moderated: rejected");
		vi.mocked(generateImageFile).mockRejectedValue(error);
		await expect(generate()).rejects.toBe(error);
		expect(slack.chat.postMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				thread_ts: "thread",
				text: expect.stringContaining("Trying google/gemini-3-pro-image"),
			}),
		);
	});

	it("treats a missing image as a failure", async () => {
		attempt(2);
		vi.mocked(generateImageFile).mockResolvedValue(undefined);
		await expect(generate()).rejects.toThrow("did not return an image");
		expect(slack.chat.postMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				text: expect.stringContaining("Trying openai/gpt-image-2"),
			}),
		);
	});

	it("doesn't post a notice after the last model fails", async () => {
		attempt(3);
		vi.mocked(generateImageFile).mockRejectedValue(new Error("boom"));
		await expect(generate()).rejects.toThrow("boom");
		expect(slack.chat.postMessage).not.toHaveBeenCalled();
	});

	it("still rethrows the generation error if the notice fails", async () => {
		attempt(1);
		vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.mocked(slack.chat.postMessage).mockRejectedValue(new Error("Slack down"));
		vi.mocked(generateImageFile).mockRejectedValue(new Error("boom"));
		await expect(generate()).rejects.toThrow("boom");
	});
});
