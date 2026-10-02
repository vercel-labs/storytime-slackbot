import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const catalog = {
	data: [
		{
			id: "anthropic/claude-haiku-4.5",
			type: "language",
			modalities: { output: ["text"] },
		},
		{
			id: "google/gemini-3-pro-image",
			type: "language",
			modalities: { output: ["text", "image"] },
		},
		{
			id: "spacexai/grok-imagine-image-2.0",
			type: "image",
			modalities: { output: ["image"] },
		},
		{
			id: "google/veo-3.1-generate-001",
			type: "video",
			modalities: { output: ["video"] },
		},
		{ id: "openai/text-embedding-3-small", type: "embedding" },
	],
};

async function load() {
	// Reset the module so the catalog cache starts empty.
	vi.resetModules();
	return import("./model-catalog");
}

const values = (options: { value: string }[]) => options.map((o) => o.value);

describe("getModelOptions", () => {
	beforeEach(() => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => Response.json(catalog)),
		);
	});
	afterEach(() => vi.unstubAllGlobals());

	it("lists models by kind", async () => {
		const { getModelOptions } = await load();
		expect(values(await getModelOptions("story", ""))).toEqual([
			"anthropic/claude-haiku-4.5",
			"google/gemini-3-pro-image",
		]);
		expect(values(await getModelOptions("image", ""))).toEqual([
			"google/gemini-3-pro-image",
			"spacexai/grok-imagine-image-2.0",
		]);
		expect(values(await getModelOptions("video", ""))).toEqual([
			"google/veo-3.1-generate-001",
		]);
		// The catalog is cached between requests.
		expect(fetch).toHaveBeenCalledOnce();
	});

	it("filters by query and offers the typed value first", async () => {
		const { getModelOptions } = await load();
		const options = await getModelOptions("image", "  GROK ");
		expect(options).toEqual([
			{ text: { type: "plain_text", text: 'Use "GROK"' }, value: "GROK" },
			{
				text: { type: "plain_text", text: "spacexai/grok-imagine-image-2.0" },
				value: "spacexai/grok-imagine-image-2.0",
			},
		]);
	});

	it("doesn't duplicate an exact match", async () => {
		const { getModelOptions } = await load();
		expect(
			values(await getModelOptions("video", "google/veo-3.1-generate-001")),
		).toEqual(["google/veo-3.1-generate-001"]);
	});

	it("still accepts typed values when the catalog is unavailable", async () => {
		vi.mocked(fetch).mockRejectedValue(new Error("offline"));
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const { getModelOptions } = await load();
		expect(values(await getModelOptions("story", "custom/model"))).toEqual([
			"custom/model",
		]);
	});

	it("truncates long labels to Slack's limit", async () => {
		const { getModelOptions } = await load();
		const id = `custom/${"x".repeat(100)}`;
		const [option] = await getModelOptions("story", id);
		expect(option.value).toBe(id);
		expect(option.text.text).toHaveLength(75);
	});

	it("maps only model block IDs to kinds", async () => {
		const { modelKindForField } = await load();
		expect(modelKindForField("image_model")).toBe("image");
		expect(modelKindForField("themes")).toBeUndefined();
		expect(modelKindForField("toString")).toBeUndefined();
	});
});
