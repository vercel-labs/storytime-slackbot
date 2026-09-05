import { experimental_generateVideo as generateVideo } from "@ai-sdk/workflow/video";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseStorytimeArgs } from "../lib/args";
import { VIDEO_GEN_PROMPT } from "../lib/prompt";
import { storytime } from "./create";
import { generateStoryPiece } from "./steps/generate-story-piece";
import {
	broadcastStoryboardImage,
	generateStoryboardImage,
} from "./steps/generate-storyboard-image";
import {
	postSlackMessage,
	updateSlackMessage,
} from "./steps/post-slack-message";
import { uploadStoryVideo } from "./steps/upload-story-video";

vi.mock("@ai-sdk/workflow/video", () => ({
	experimental_generateVideo: vi.fn(),
}));
vi.mock("workflow", () => ({
	FatalError: Error,
	defineHook: () => ({
		create: async function* () {
			yield { text: "They found the treasure. The end!", ts: "reply" };
		},
	}),
}));
vi.mock("./steps/generate-story-piece", () => ({
	generateStoryPiece: vi.fn(),
}));
vi.mock("./steps/generate-storyboard-image", () => ({
	generateStoryboardImage: vi.fn(),
	broadcastStoryboardImage: vi.fn(),
}));
vi.mock("./steps/post-slack-message", () => ({
	postSlackMessage: vi.fn(),
	updateSlackMessage: vi.fn(),
	addReactionToMessage: vi.fn(),
	removeReactionFromMessage: vi.fn(),
}));
vi.mock("./steps/upload-story-video", () => ({ uploadStoryVideo: vi.fn() }));

describe("storytime options", () => {
	it("defaults to image output", () => {
		expect(parseStorytimeArgs([])).toMatchObject({
			video: false,
			videoModel: "klingai/kling-v3.0-t2v",
			imageModel: "google/gemini-3-pro-image",
		});
	});

	it("combines --video with themes and a model override", () => {
		expect(
			parseStorytimeArgs([
				"--video",
				"--video-model",
				"custom/video",
				"-t",
				"Pirates",
				"-t",
				"Space",
			]),
		).toMatchObject({
			video: true,
			videoModel: "custom/video",
			themes: ["Pirates", "Space"],
		});
	});

	it("does not enable video from --video-model alone", () => {
		expect(parseStorytimeArgs(["--video-model", "custom/video"]).video).toBe(
			false,
		);
	});
});

describe("storytime final output", () => {
	const finalStory = "The pirates found their treasure among the stars.";
	const video = {
		type: "url" as const,
		url: "https://example.com/story.mp4",
		mediaType: "video/mp4",
	};
	const run = (text = "") =>
		storytime(new URLSearchParams({ channel_id: "channel", text }));

	beforeEach(() => {
		vi.resetAllMocks();
		vi.mocked(postSlackMessage)
			.mockResolvedValueOnce({ ts: "thread", message: { user: "bot" } })
			.mockResolvedValue({ ts: "final", message: { user: "bot" } });
		vi.mocked(generateStoryPiece)
			.mockResolvedValueOnce({
				done: false,
				encouragement: "What next?",
				story: "Space pirates!",
			})
			.mockResolvedValueOnce({
				done: true,
				encouragement: "The end!",
				story: finalStory,
			});
		vi.mocked(generateStoryboardImage).mockResolvedValue("image-file");
		vi.mocked(generateVideo).mockResolvedValue({
			status: "completed",
			videos: [video],
			warnings: [],
			response: {
				timestamp: new Date(),
				modelId: "video-model",
				headers: undefined,
			},
		});
		vi.mocked(uploadStoryVideo).mockResolvedValue("video-file");
	});

	it("keeps the default image generation and broadcast", async () => {
		await run("-s watercolor -p 6");
		expect(generateStoryboardImage).toHaveBeenCalledWith(
			"channel",
			"thread",
			finalStory,
			"google/gemini-3-pro-image",
			"watercolor",
			6,
		);
		expect(generateVideo).not.toHaveBeenCalled();
		expect(uploadStoryVideo).not.toHaveBeenCalled();
		expect(broadcastStoryboardImage).toHaveBeenCalledWith(
			"channel",
			"thread",
			"image-file",
		);
	});

	it.each(["", " --video-model custom/video"])(
		"generates only a video with --video%s",
		async (override) => {
			await run(`--video${override}`);
			expect(generateVideo).toHaveBeenCalledWith({
				model: override ? "custom/video" : "klingai/kling-v3.0-t2v",
				prompt: VIDEO_GEN_PROMPT(finalStory),
			});
			expect(generateStoryboardImage).not.toHaveBeenCalled();
			expect(uploadStoryVideo).toHaveBeenCalledWith("channel", "thread", video);
			expect(broadcastStoryboardImage).toHaveBeenCalledWith(
				"channel",
				"thread",
				"video-file",
			);
			expect(postSlackMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					text: expect.stringContaining("Generating story video"),
					thread_ts: "thread",
					reply_broadcast: true,
				}),
			);
			expect(updateSlackMessage).toHaveBeenLastCalledWith({
				channel: "channel",
				ts: "final",
				text: `*Here is the final story:*\n\n> _${finalStory}_`,
			});
		},
	);

	it.each(["generation", "upload"])(
		"reports %s failure without losing the final story",
		async (stage) => {
			const error = new Error("Provider or Slack failed");
			if (stage === "generation")
				vi.mocked(generateVideo).mockRejectedValue(error);
			else vi.mocked(uploadStoryVideo).mockRejectedValue(error);
			await expect(run("--video")).rejects.toThrow(error);
			expect(updateSlackMessage).toHaveBeenLastCalledWith(
				expect.objectContaining({
					ts: "final",
					text: expect.stringContaining("could not be generated or uploaded"),
				}),
			);
			expect(vi.mocked(updateSlackMessage).mock.lastCall?.[0]).toEqual(
				expect.objectContaining({
					text: expect.stringContaining(finalStory),
				}),
			);
			expect(broadcastStoryboardImage).not.toHaveBeenCalled();
			expect(generateStoryboardImage).not.toHaveBeenCalled();
		},
	);
});
