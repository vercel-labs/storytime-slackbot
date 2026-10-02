import { z } from "zod";

// Public AI Gateway model catalog. Unlike `gateway.getAvailableModels()`, it
// includes output modalities, which identify language models that can return
// images, such as `google/gemini-3-pro-image`.
const CATALOG_URL = "https://ai-gateway.vercel.sh/v1/models";
const CACHE_TTL_MS = 10 * 60 * 1000;
// Slack expects an options response within 3 seconds.
const FETCH_TIMEOUT_MS = 2000;
// Slack limits for external select options.
const MAX_OPTIONS = 100;
const MAX_TEXT_LENGTH = 75;
export const MAX_MODEL_ID_LENGTH = 150;

const catalogSchema = z.object({
	data: z.array(
		z.object({
			id: z.string(),
			type: z.string().optional(),
			modalities: z
				.object({ output: z.array(z.string()).optional() })
				.optional(),
		}),
	),
});
type CatalogModel = z.infer<typeof catalogSchema>["data"][number];

export type ModelKind = "story" | "image" | "video";

const MODEL_FIELDS: Record<string, ModelKind> = {
	model: "story",
	image_model: "image",
	video_model: "video",
};

export const modelKindForField = (blockId: string): ModelKind | undefined =>
	Object.hasOwn(MODEL_FIELDS, blockId) ? MODEL_FIELDS[blockId] : undefined;

const matchesKind: Record<ModelKind, (model: CatalogModel) => boolean> = {
	story: (m) =>
		m.type === "language" && !!m.modalities?.output?.includes("text"),
	// Includes both dedicated image models and language models with image output.
	image: (m) =>
		m.type === "image" || !!m.modalities?.output?.includes("image"),
	video: (m) => m.type === "video",
};

let cache: { models: CatalogModel[]; expires: number } | undefined;

async function getCatalog(): Promise<CatalogModel[]> {
	if (cache && cache.expires > Date.now()) return cache.models;
	try {
		const res = await fetch(CATALOG_URL, {
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const { data } = catalogSchema.parse(await res.json());
		cache = { models: data, expires: Date.now() + CACHE_TTL_MS };
		return data;
	} catch (error) {
		console.warn("Could not load AI Gateway model catalog", error);
		// Serve stale results rather than an empty menu.
		return cache?.models ?? [];
	}
}

export const modelOption = (id: string, label = id) => ({
	text: {
		type: "plain_text" as const,
		text:
			label.length > MAX_TEXT_LENGTH
				? `${label.slice(0, MAX_TEXT_LENGTH - 1)}…`
				: label,
	},
	value: id,
});

/**
 * Builds Slack select options for a model field. The typed query is always
 * offered first, so the menu behaves like a combobox and accepts model IDs
 * that are missing from the catalog.
 */
export async function getModelOptions(kind: ModelKind, query: string) {
	const typed = query.trim().slice(0, MAX_MODEL_ID_LENGTH);
	const needle = typed.toLowerCase();
	const ids = (await getCatalog())
		.filter((m) => matchesKind[kind](m) && m.id.toLowerCase().includes(needle))
		.map((m) => m.id)
		.sort();
	const options = ids.map((id) => modelOption(id));
	if (typed && !ids.includes(typed)) {
		options.unshift(modelOption(typed, `Use "${typed}"`));
	}
	return options.slice(0, MAX_OPTIONS);
}
