import type { WorkflowGenerateVideoResult } from "@ai-sdk/workflow/video";
import { FatalError } from "workflow";
import { slack } from "@/lib/slack";

export async function uploadStoryVideo(
	channelId: string,
	threadTs: string,
	video: WorkflowGenerateVideoResult["videos"][number] | undefined,
): Promise<string> {
	"use step";

	if (!video) {
		throw new FatalError("Video generation returned no videos");
	}

	const extension = {
		"video/mp4": "mp4",
		"video/webm": "webm",
		"video/quicktime": "mov",
	}[video.mediaType];
	if (!extension) {
		throw new FatalError(`Unsupported video media type: ${video.mediaType}`);
	}

	let file: Buffer;
	if (video.type === "url") {
		// Download only in this step, keeping hosted video bytes out of workflow state.
		const response = await fetch(video.url);
		if (!response.ok) {
			throw new Error(`Failed to download video: HTTP ${response.status}`);
		}
		file = Buffer.from(await response.arrayBuffer());
	} else if (video.type === "base64") {
		file = Buffer.from(video.data, "base64");
	} else {
		file = Buffer.from(video.data);
	}

	const res = await slack.files.uploadV2({
		channel_id: channelId,
		thread_ts: threadTs,
		file,
		filename: `story.${extension}`,
		title: "Story Video",
	});
	// uploadV2 returns nested file groups, which the Slack SDK does not type.
	const { files } = res as typeof res & {
		files?: { files?: { id?: string }[] }[];
	};
	const fileId = files?.[0]?.files?.[0]?.id;
	if (!res.ok || !fileId) {
		throw new FatalError(
			`Failed to upload video: ${res.error || "missing file ID"}`,
		);
	}
	return fileId;
}
