import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { slack } from "@/lib/slack";
import { uploadStoryVideo } from "./upload-story-video";

vi.mock("@/lib/slack", () => ({ slack: { files: { uploadV2: vi.fn() } } }));

beforeEach(() => {
	vi.resetAllMocks();
	vi.stubGlobal(
		"fetch",
		vi.fn().mockResolvedValue(new Response("video-bytes")),
	);
	vi.mocked(slack.files.uploadV2).mockResolvedValue({
		ok: true,
		...{ files: [{ files: [{ id: "file-id" }] }] },
	});
});

afterEach(() => vi.unstubAllGlobals());

it("downloads a hosted video in the upload step and returns only the Slack file ID", async () => {
	await expect(
		uploadStoryVideo("channel", "thread", {
			type: "url",
			url: "https://example.com/video.mp4",
			mediaType: "video/mp4",
		}),
	).resolves.toBe("file-id");
	expect(fetch).toHaveBeenCalledWith("https://example.com/video.mp4");
	expect(slack.files.uploadV2).toHaveBeenCalledWith({
		channel_id: "channel",
		thread_ts: "thread",
		file: Buffer.from("video-bytes"),
		filename: "story.mp4",
		title: "Story Video",
	});
});

it.each(["base64", "binary"] as const)(
	"uploads %s video data without fetching",
	async (type) => {
		const bytes = Buffer.from("video-bytes");
		const video =
			type === "base64"
				? { type, data: bytes.toString("base64"), mediaType: "video/webm" }
				: { type, data: new Uint8Array(bytes), mediaType: "video/webm" };
		await expect(uploadStoryVideo("channel", "thread", video)).resolves.toBe(
			"file-id",
		);
		expect(fetch).not.toHaveBeenCalled();
		expect(slack.files.uploadV2).toHaveBeenCalledWith(
			expect.objectContaining({
				file: bytes,
				filename: "story.webm",
			}),
		);
	},
);

it("rejects an empty generation result", async () => {
	await expect(
		uploadStoryVideo("channel", "thread", undefined),
	).rejects.toThrow("no videos");
	expect(slack.files.uploadV2).not.toHaveBeenCalled();
});

it("does not upload a failed download response", async () => {
	vi.mocked(fetch).mockResolvedValue(
		new Response("Unavailable", { status: 503 }),
	);
	await expect(
		uploadStoryVideo("channel", "thread", {
			type: "url",
			url: "https://example.com/video.mp4",
			mediaType: "video/mp4",
		}),
	).rejects.toThrow("HTTP 503");
	expect(slack.files.uploadV2).not.toHaveBeenCalled();
});

it.each([{ ok: false, error: "upload_failed" }, { ok: true }])(
	"rejects an unsuccessful Slack upload: %j",
	async (response) => {
		vi.mocked(slack.files.uploadV2).mockResolvedValue(response);
		await expect(
			uploadStoryVideo("channel", "thread", {
				type: "binary",
				data: new Uint8Array([1, 2, 3]),
				mediaType: "video/mp4",
			}),
		).rejects.toThrow("Failed to upload video");
	},
);
