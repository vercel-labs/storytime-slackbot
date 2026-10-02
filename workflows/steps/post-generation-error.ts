import { FatalError, getWorkflowMetadata } from "workflow";
import { generationErrorMessage } from "@/lib/generation-error";
import { slack } from "@/lib/slack";
import { getWorkflowRunUrl } from "@/lib/workflow-run-url";

export async function postGenerationError(
	channel: string,
	threadTs: string,
	details: { outputName: string; model: string; message: string },
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
