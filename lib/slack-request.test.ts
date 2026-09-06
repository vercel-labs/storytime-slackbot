import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isValidSlackRequest } from "./slack-request";

const secret = "test-slack-signing-secret";
const now = 1_800_000_000;
const body = '{"type":"url_verification","challenge":"test"}';

function signedRequest(rawBody = body, timestamp = String(now)) {
	const signature = createHmac("sha256", secret)
		.update(`v0:${timestamp}:${rawBody}`, "utf8")
		.digest("hex");
	return new Request("https://example.com/api/slack/webhook", {
		method: "POST",
		body: rawBody,
		headers: {
			"x-slack-request-timestamp": timestamp,
			"x-slack-signature": `v0=${signature}`,
		},
	});
}

describe("isValidSlackRequest", () => {
	beforeEach(() => {
		vi.stubEnv("SLACK_SIGNING_SECRET", secret);
		vi.spyOn(Date, "now").mockReturnValue(now * 1000);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it("accepts a valid signature", () => {
		expect(isValidSlackRequest(signedRequest(), body)).toBe(true);
	});

	it("rejects an incorrect signature", () => {
		const request = signedRequest();
		request.headers.set("x-slack-signature", `v0=${"0".repeat(64)}`);
		expect(isValidSlackRequest(request, body)).toBe(false);
	});

	it("rejects a tampered body", () => {
		expect(
			isValidSlackRequest(signedRequest(), body.replace("test", "other")),
		).toBe(false);
	});

	it("rejects a tampered timestamp within the allowed window", () => {
		const request = signedRequest();
		request.headers.set("x-slack-request-timestamp", String(now + 1));
		expect(isValidSlackRequest(request, body)).toBe(false);
	});

	it.each([-301, 301])("rejects a timestamp offset by %i seconds", (offset) => {
		expect(
			isValidSlackRequest(signedRequest(body, String(now + offset)), body),
		).toBe(false);
	});

	it.each([-300, 300])("accepts a timestamp offset by %i seconds", (offset) => {
		expect(
			isValidSlackRequest(signedRequest(body, String(now + offset)), body),
		).toBe(true);
	});

	it.each([undefined, ""])("rejects a missing or empty secret (%s)", (value) => {
		vi.stubEnv("SLACK_SIGNING_SECRET", value);
		expect(isValidSlackRequest(signedRequest(), body)).toBe(false);
	});

	it.each(["x-slack-request-timestamp", "x-slack-signature"])(
		"rejects a missing %s header",
		(header) => {
			const request = signedRequest();
			request.headers.delete(header);
			expect(isValidSlackRequest(request, body)).toBe(false);
		},
	);

	it.each([
		"",
		"not-a-number",
		`${now}.0`,
		`+${now}`,
		`-${now}`,
		"1.8e9",
		`${now}junk`,
		"9007199254740992",
	])(
		"rejects malformed timestamp %j even with a matching signature",
		(timestamp) => {
			expect(isValidSlackRequest(signedRequest(body, timestamp), body)).toBe(false);
		},
	);

	it.each([
		"",
		"v0=",
		`v1=${"a".repeat(64)}`,
		`v0=${"g".repeat(64)}`,
		`v0=${"a".repeat(63)}`,
		`v0=${"a".repeat(65)}`,
		"a".repeat(64),
	])(
		"rejects malformed signature %j without throwing",
		(signature) => {
			const request = signedRequest();
			request.headers.set("x-slack-signature", signature);
			expect(isValidSlackRequest(request, body)).toBe(false);
		},
	);

	it("verifies the original Unicode body without JSON normalization", async () => {
		const rawBody = '{ "text": "caf\u00e9 \ud83d\ude80 \u65e5\u672c", "count": 1 }\n';
		const request = signedRequest(rawBody);
		expect(isValidSlackRequest(request, await request.text())).toBe(true);
		expect(
			isValidSlackRequest(request, JSON.stringify(JSON.parse(rawBody))),
		).toBe(false);
	});

	it("verifies URL-encoded modal payloads without decoding the raw body", () => {
		const rawBody = "payload=%7B%22text%22%3A%22caf%C3%A9+test%22%7D";
		const request = signedRequest(rawBody);
		expect(isValidSlackRequest(request, rawBody)).toBe(true);
		expect(isValidSlackRequest(request, decodeURIComponent(rawBody))).toBe(false);
	});
});
