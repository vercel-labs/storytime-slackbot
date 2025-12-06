/**
 * Centralized hook token generation for Vercel Workflows.
 *
 * Hook tokens must be unique and consistent between:
 * 1. Workflow creating the hook
 * 2. Webhook handler resuming the hook
 *
 * Pattern: `{workflow-name}:{channel}:{thread_ts}`
 */

export function storytimeToken(channel: string, threadTs: string) {
	return `slack-message-webhook:${channel}:${threadTs}`;
}

export function tiktokFeedbackToken(channel: string, threadTs: string) {
	return `tiktok-feedback:${channel}:${threadTs}`;
}
