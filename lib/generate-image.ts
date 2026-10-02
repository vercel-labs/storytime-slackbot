import { type GeneratedFile, gateway, generateImage, generateText } from "ai";

type ProviderOptions = Parameters<typeof generateImage>[0]["providerOptions"];

let modelTypes: Promise<Map<string, string>> | undefined;

// Looks up the model type ("language", "image", …) from AI Gateway metadata.
// Cached per process, since the model list rarely changes.
async function getModelType(modelId: string): Promise<string | undefined> {
	modelTypes ??= gateway.getAvailableModels().then(
		({ models }) =>
			new Map(models.map((m) => [m.id, m.modelType ?? "language"])),
	);
	try {
		return (await modelTypes).get(modelId);
	} catch (err) {
		// Don't cache failures, and fall back to treating it as a language model.
		modelTypes = undefined;
		console.warn("Failed to fetch AI Gateway model metadata:", err);
		return undefined;
	}
}

/**
 * Generates a single image with either kind of image-capable model:
 * - Dedicated image models (e.g. `spacexai/grok-imagine-image-2.0`) via `generateImage()`
 * - Multimodal language models (e.g. `google/gemini-3-pro-image`) via `generateText()`,
 *   which return the image as a file part
 */
export async function generateImageFile({
	model,
	prompt,
	providerOptions,
}: {
	model: string;
	prompt: string;
	providerOptions?: ProviderOptions;
}): Promise<GeneratedFile | undefined> {
	if ((await getModelType(model)) === "image") {
		const { image } = await generateImage({ model, prompt, providerOptions });
		return image;
	}

	const { files } = await generateText({ model, prompt, providerOptions });
	return files.find((f) => f.mediaType.startsWith("image/")) ?? files[0];
}
