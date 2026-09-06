import { createHmac, timingSafeEqual } from "node:crypto";

export function isValidSlackRequest(request: Request, body: string): boolean {
	const secret = process.env.SLACK_SIGNING_SECRET;
	const timestamp = request.headers.get("x-slack-request-timestamp");
	const signature = request.headers.get("x-slack-signature");
	if (
		!secret ||
		!timestamp ||
		!/^\d+$/.test(timestamp) ||
		!signature ||
		!/^v0=[a-f0-9]{64}$/.test(signature)
	) {
		return false;
	}

	const seconds = Number(timestamp);
	if (
		!Number.isSafeInteger(seconds) ||
		Math.abs(Math.floor(Date.now() / 1000) - seconds) > 300
	) {
		return false;
	}

	const expected = Buffer.from(
		`v0=${createHmac("sha256", secret)
			.update(`v0:${timestamp}:${body}`, "utf8")
			.digest("hex")}`,
	);
	const received = Buffer.from(signature);
	return (
		received.length === expected.length && timingSafeEqual(received, expected)
	);
}
