import { gateway, generateImage, generateText } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ai", () => ({
	gateway: { getAvailableModels: vi.fn() },
	generateImage: vi.fn(),
	generateText: vi.fn(),
}));

const png = { mediaType: "image/png", uint8Array: new Uint8Array([1]) };

async function load() {
	// Reset the module so the per-process model type cache starts empty.
	vi.resetModules();
	return (await import("./generate-image")).generateImageFile;
}

describe("generateImageFile", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(gateway.getAvailableModels).mockResolvedValue({
			models: [
				{ id: "spacexai/grok-imagine-image-2.0", modelType: "image" },
				{ id: "google/gemini-3-pro-image", modelType: "language" },
			],
		} as never);
		vi.mocked(generateImage).mockResolvedValue({ image: png } as never);
		vi.mocked(generateText).mockResolvedValue({ files: [png] } as never);
	});

	it("uses generateImage() for dedicated image models", async () => {
		const generateImageFile = await load();
		const file = await generateImageFile({
			model: "spacexai/grok-imagine-image-2.0",
			prompt: "a cat",
		});
		expect(file).toBe(png);
		expect(generateImage).toHaveBeenCalledWith(
			expect.objectContaining({ model: "spacexai/grok-imagine-image-2.0" }),
		);
		expect(generateText).not.toHaveBeenCalled();
	});

	it("uses generateText() file parts for multimodal language models", async () => {
		const generateImageFile = await load();
		const file = await generateImageFile({
			model: "google/gemini-3-pro-image",
			prompt: "a cat",
		});
		expect(file).toBe(png);
		expect(generateText).toHaveBeenCalled();
		expect(generateImage).not.toHaveBeenCalled();
	});

	it("falls back to generateText() when metadata is unavailable", async () => {
		vi.mocked(gateway.getAvailableModels).mockRejectedValue(new Error("down"));
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const generateImageFile = await load();
		await generateImageFile({ model: "unknown/model", prompt: "a cat" });
		expect(generateText).toHaveBeenCalled();
	});
});
