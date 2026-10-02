// Models to try, in order, when the selected image or video model fails.
// The selected model is skipped, so each list has one more candidate than
// FALLBACK_COUNT to keep the number of fallbacks constant.
export const FALLBACK_COUNT = 2;

export const IMAGE_FALLBACK_MODELS = [
	"google/gemini-3-pro-image",
	"openai/gpt-image-2",
	"spacexai/grok-imagine-image-2.0",
];

// Must support asynchronous text-to-video generation with webhooks.
export const VIDEO_FALLBACK_MODELS = [
	"google/veo-3.1-generate-001",
	"klingai/kling-v3.0-t2v",
	"bytedance/seedance-2.0",
];

/** Returns the selected model followed by up to FALLBACK_COUNT fallbacks. */
export function withFallbacks(model: string, candidates: string[]): string[] {
	return [model, ...candidates.filter((m) => m !== model)].slice(
		0,
		FALLBACK_COUNT + 1,
	);
}
