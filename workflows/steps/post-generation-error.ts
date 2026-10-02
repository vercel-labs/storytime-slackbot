import { FatalError, getWorkflowMetadata } from "workflow";
import {
	fallbackNoticeMessage,
	generationErrorMessage,
} from "@/lib/generation-error";
import { slack } from "@/lib/slack";
import { getWorkflowRunUrl } from "@/lib/workflow-run-url";

export async function postGenerationError(
	channel: string,
	threadTs: string,
	details: { outputName: string; models: string[]; message: string },
) {
	"use step";

	// Runs as a step so the OIDC token used for the dashboard link is available.
	const { workflowRunId } = getWorkflowMetadata();
	const res = await slack.chat.postMessage({
		channel,
		thread_ts: threadTs,
		...generationErrorMessage({
			...details,
			runId: workflowRunId,
			runUrl: getWorkflowRunUrl(workflowRunId),
		}),
	});
	if (!res.ok) {
		throw new FatalError(`Failed to post error message: ${res.error}`);
	}
}

/** Posts a thread notice that a model failed and a fallback is being tried. */
export async function postFallbackNotice(
	channel: string,
	threadTs: string,
	details: Parameters<typeof fallbackNoticeMessage>[0],
) {
	"use step";

	const res = await slack.chat.postMessage({
		channel,
		thread_ts: threadTs,
		...fallbackNoticeMessage(details),
	});
	if (!res.ok) {
		throw new FatalError(`Failed to post fallback notice: ${res.error}`);
	}
}
