import { experimental_generateVideo as generateVideo } from "@ai-sdk/workflow/video";
import { stringToArgv } from "@tootallnate/string-argv";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseStorytimeArgs } from "../lib/args";
import { SYSTEM_PROMPT, VIDEO_GEN_PROMPT } from "../lib/prompt";
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
			videoModel: "google/veo-3.1-generate-001",
			videoDuration: undefined,
			imageModel: "google/gemini-3-pro-image",
			style: "",
			transcripts: false,
		});
	});

	it.each(["--style", "-s"])(
		"parses %s as the shared style",
		(flag) => {
			expect(parseStorytimeArgs([flag, "pencil sketch"]).style).toBe("pencil sketch");
		},
	);

	it("opts into transcripts without enabling video", () => {
		expect(parseStorytimeArgs(["--transcripts"])).toMatchObject({
			transcripts: true,
			video: false,
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

	it.each([8, 2.5])("parses a video duration of %s seconds", (duration) => {
		expect(
			parseStorytimeArgs(["--video-duration", String(duration)]),
		).toMatchObject({
			video: false,
			videoDuration: duration,
		});
	});

	it.each(["0", "-1", "NaN", "Infinity", "abc"])(
		"rejects invalid video duration %s",
		(duration) => {
			expect(() => parseStorytimeArgs(["--video-duration", duration])).toThrow(
				"--video-duration must be a positive number of seconds",
			);
		},
	);

	it("requires a value for --video-duration", () => {
		expect(() => parseStorytimeArgs(["--video-duration"])).toThrow();
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
		storytime("channel", parseStorytimeArgs(stringToArgv(text)));

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
		await run("--style watercolor -p 6");
		expect(generateStoryboardImage).toHaveBeenCalledWith(
			"channel",
			"thread",
			finalStory,
			"google/gemini-3-pro-image",
			"watercolor",
			6,
			false,
		);
		for (const call of vi.mocked(generateStoryPiece).mock.calls) {
			expect(call[3]).toBe(false);
		}
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
				model: override ? "custom/video" : "google/veo-3.1-generate-001",
				prompt: VIDEO_GEN_PROMPT(finalStory),
				duration: undefined,
				providerOptions: undefined,
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

	it.each(["", " --video"])(
		"enables transcripts for the whole session with --transcripts%s",
		async (videoFlag) => {
			await run(`--transcripts${videoFlag}`);
			expect(generateStoryPiece).toHaveBeenCalledTimes(2);
			for (const call of vi.mocked(generateStoryPiece).mock.calls) {
				expect(call[3]).toBe(true);
			}
			if (videoFlag) {
				expect(generateVideo).toHaveBeenCalledWith(
					expect.objectContaining({
						providerOptions: { gateway: { transcripts: { enabled: true } } },
					}),
				);
			} else {
				expect(generateStoryboardImage).toHaveBeenCalledWith(
					"channel",
					"thread",
					finalStory,
					"google/gemini-3-pro-image",
					"",
					null,
					true,
				);
			}
		},
	);

	it.each(["--style", "-s"])(
		"applies %s to the video prompt",
		async (flag) => {
			await run(`--video ${flag} "pencil sketch"`);
			const prompt = vi.mocked(generateVideo).mock.calls[0][0].prompt;
			expect(prompt).toContain("visuals in the style of pencil sketch");
			expect(prompt).toContain(finalStory);
			expect(prompt).not.toContain("colorful illustrations");
		},
	);

	it("passes instructions separately on every story turn", async () => {
		await run("-t Pirates -t Space");
		expect(generateStoryPiece).toHaveBeenCalledTimes(2);
		for (const [messages, , instructions] of vi.mocked(generateStoryPiece).mock.calls) {
			expect(instructions).toBe(SYSTEM_PROMPT(["Pirates", "Space"]));
			expect(messages.some((message) => message.role === "system")).toBe(false);
		}
	});

	it("passes the requested duration to video generation", async () => {
		await run("--video --video-duration 8");
		expect(generateVideo).toHaveBeenCalledWith(
			expect.objectContaining({ duration: 8 }),
		);
	});

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
