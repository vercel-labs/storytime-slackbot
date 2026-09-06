import { WebClient } from "@slack/web-api";

export const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

// Modal triggers expire after three seconds; don't use the workflow client's retry policy.
export const modalSlack = new WebClient(process.env.SLACK_BOT_TOKEN, {
	timeout: 2000,
	retryConfig: { retries: 0 },
	rejectRateLimitedCalls: true,
});
