import { getVercelOidcTokenSync } from "@vercel/functions/oidc";

// Reads the team slug (`owner`) and project name (`project`) claims from the
// function's Vercel OIDC token. The token is only decoded for display, never
// trusted for authorization, so its signature and expiry aren't checked.
function getOidcClaims(): { owner?: string; project?: string } | undefined {
	try {
		const [, payload] = getVercelOidcTokenSync().split(".");
		return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
	} catch {
		return undefined;
	}
}

/**
 * Returns the Vercel dashboard URL for a workflow run, or `undefined` when it
 * can't be determined. Set `VERCEL_TEAM_SLUG` and `VERCEL_PROJECT_NAME` to
 * override the values from the OIDC token, e.g. when OIDC is disabled.
 */
export function getWorkflowRunUrl(runId: string): string | undefined {
	const environment = process.env.VERCEL_TARGET_ENV || process.env.VERCEL_ENV;
	// Local development runs use the local Workflow world, not the dashboard.
	if (!environment || environment === "development") return undefined;
	let team = process.env.VERCEL_TEAM_SLUG;
	let project = process.env.VERCEL_PROJECT_NAME;
	if (!team || !project) {
		const claims = getOidcClaims();
		team ||= claims?.owner;
		project ||= claims?.project;
	}
	if (!team || !project) return undefined;
	const url = new URL(
		`https://vercel.com/${encodeURIComponent(team)}/${encodeURIComponent(project)}/workflows/runs/${encodeURIComponent(runId)}`,
	);
	url.searchParams.set("environment", environment);
	return url.toString();
}
