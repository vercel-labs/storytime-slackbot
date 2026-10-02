import { getVercelOidcTokenSync } from "@vercel/functions/oidc";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getWorkflowRunUrl } from "./workflow-run-url";

vi.mock("@vercel/functions/oidc", () => ({ getVercelOidcTokenSync: vi.fn() }));

const jwt = (claims: object) =>
	`header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;

describe("getWorkflowRunUrl", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		for (const name of [
			"VERCEL_ENV",
			"VERCEL_TARGET_ENV",
			"VERCEL_TEAM_SLUG",
			"VERCEL_PROJECT_NAME",
		])
			vi.stubEnv(name, "");
		vi.stubEnv("VERCEL_ENV", "production");
		vi.mocked(getVercelOidcTokenSync).mockReturnValue(
			jwt({ owner: "vercel-labs", project: "storytime-slackbot" }),
		);
	});
	afterEach(() => vi.unstubAllEnvs());

	it("uses the team and project from the OIDC token", () => {
		expect(getWorkflowRunUrl("wrun_41M3YQYGZQ0GP9DDBHWBR7SZDF")).toBe(
			"https://vercel.com/vercel-labs/storytime-slackbot/workflows/runs/wrun_41M3YQYGZQ0GP9DDBHWBR7SZDF?environment=production",
		);
	});

	it("prefers explicit env vars and the target environment", () => {
		vi.stubEnv("VERCEL_TEAM_SLUG", "acme");
		vi.stubEnv("VERCEL_PROJECT_NAME", "bot");
		vi.stubEnv("VERCEL_TARGET_ENV", "staging");
		expect(getWorkflowRunUrl("wrun_1")).toBe(
			"https://vercel.com/acme/bot/workflows/runs/wrun_1?environment=staging",
		);
		expect(getVercelOidcTokenSync).not.toHaveBeenCalled();
	});

	it("returns undefined without OIDC or env vars", () => {
		vi.mocked(getVercelOidcTokenSync).mockImplementation(() => {
			throw new Error("missing header");
		});
		expect(getWorkflowRunUrl("wrun_1")).toBeUndefined();
	});

	it.each(["", "development"])(
		"returns undefined for local runs (VERCEL_ENV=%j)",
		(env) => {
			vi.stubEnv("VERCEL_ENV", env);
			expect(getWorkflowRunUrl("wrun_1")).toBeUndefined();
		},
	);
});
