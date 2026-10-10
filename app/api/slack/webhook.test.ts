import { createHmac } from "node:crypto";
import { waitUntil } from "@vercel/functions";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { start } from "workflow/api";
import { parseStorytimeArgs, type StorytimeArgs } from "@/lib/args";
import { slack } from "@/lib/slack";
import { slackMessageHook, storytime } from "@/workflows/create";
import { POST as event } from "./webhook/route";

vi.mock("@vercel/functions", () => ({ waitUntil: vi.fn() }));
vi.mock("workflow/api", () => ({ start: vi.fn() }));
vi.mock("@/workflows/create", () => ({
	storytime: vi.fn(),
	slackMessageHook: { resume: vi.fn() },
}));
vi.mock("@/lib/slack", () => ({
	slack: { chat: { postEphemeral: vi.fn() } },
}));

const secret = "test-secret";
const bot = "U0BOT";
const channel = "C123";
const user = "U123";
const ts = "1700000000.000100";
let background: Promise<unknown>[] = [];

function signedRequest(body: string, headers: Record<string, string> = {}) {
	const timestamp = String(Math.floor(Date.now() / 1000));
	const signature = createHmac("sha256", secret)
		.update(`v0:${timestamp}:${body}`)
		.digest("hex");
	return new Request("https://example.com/api/slack/webhook", {
		method: "POST",
		body,
		headers: {
			...headers,
			"x-slack-request-timestamp": timestamp,
			"x-slack-signature": `v0=${signature}`,
		},
	});
}

function mention(
	text = `<@${bot}>`,
	overrides: Record<string, unknown> = {},
	authorized = true,
) {
	return {
		type: "event_callback",
		...(authorized ? { authorizations: [{ user_id: bot, is_bot: true }] } : {}),
		event: { type: "app_mention", channel, user, text, ts, ...overrides },
	};
}

const threadReply = (overrides: Record<string, unknown> = {}) => ({
	type: "event_callback",
	event: {
		type: "message",
		channel,
		user,
		text: "and then the dragon sneezed",
		thread_ts: ts,
		ts: "1700000001.000200",
		...overrides,
	},
});

const eventRequest = (payload: unknown, headers?: Record<string, string>) =>
	signedRequest(JSON.stringify(payload), headers);

// `start()` is overloaded, so the recorded arguments need a concrete shape.
const startedCall = () =>
	vi.mocked(start).mock.calls[0][1] as unknown as [string, StorytimeArgs];

beforeEach(() => {
	vi.resetAllMocks();
	vi.stubEnv("SLACK_SIGNING_SECRET", secret);
	background = [];
	vi.mocked(waitUntil).mockImplementation((promise) => {
		background.push(promise);
	});
	vi.mocked(start).mockResolvedValue({ runId: "run" } as Awaited<
		ReturnType<typeof start>
	>);
	vi.mocked(slackMessageHook.resume).mockResolvedValue({
		runId: "run",
	} as Awaited<ReturnType<typeof slackMessageHook.resume>>);
});

afterEach(() => vi.unstubAllEnvs());

describe("app mention", () => {
	it("starts a story with the defaults for a bare mention", async () => {
		const response = await event(eventRequest(mention()));
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("OK");
		await Promise.all(background);
		expect(start).toHaveBeenCalledOnce();
		expect(vi.mocked(start).mock.calls[0][0]).toBe(storytime);
		const [startedChannel, args] = startedCall();
		expect(startedChannel).toBe(channel);
		// Themes are picked at random when the mention doesn't name any.
		expect(args.themes).toHaveLength(2);
		expect(args).toEqual({ ...parseStorytimeArgs([]), themes: args.themes });
		// The same message also arrives as a `message` event; only one of the
		// two handlers may act on it.
		expect(slackMessageHook.resume).not.toHaveBeenCalled();
	});

	it("applies the flags typed after the mention", async () => {
		const flags = '-t Pirates -t Space --video --style "pencil sketch" -e rocket';
		await event(eventRequest(mention(`<@${bot}> ${flags}`)));
		await Promise.all(background);
		expect(start).toHaveBeenCalledWith(storytime, [
			channel,
			parseStorytimeArgs([
				"-t",
				"Pirates",
				"-t",
				"Space",
				"--video",
				"--style",
				"pencil sketch",
				"-e",
				"rocket",
			]),
		]);
	});

	it("ignores chatter and other users mentioned around the flags", async () => {
		await event(
			eventRequest(
				mention(`hey <@${bot}> please start -t Pirates -t Space cc <@U999>`),
			),
		);
		await Promise.all(background);
		expect(start).toHaveBeenCalledWith(storytime, [
			channel,
			parseStorytimeArgs(["-t", "Pirates", "-t", "Space"]),
		]);
	});

	it("keeps Gateway transcripts off for a mentioned --transcripts", async () => {
		await event(
			eventRequest(mention(`<@${bot}> --transcripts -t Pirates -t Space`)),
		);
		await Promise.all(background);
		expect(start).toHaveBeenCalledWith(storytime, [
			channel,
			parseStorytimeArgs(["-t", "Pirates", "-t", "Space"]),
		]);
	});

	it("starts when the mention is the parent of an existing thread", async () => {
		await event(eventRequest(mention(`<@${bot}>`, { thread_ts: ts })));
		await Promise.all(background);
		expect(start).toHaveBeenCalledOnce();
	});

	it("does not start a second story from a mention inside a thread", async () => {
		const response = await event(
			eventRequest(mention(`<@${bot}>`, { thread_ts: "1699999999.000001" })),
		);
		expect(response.status).toBe(200);
		await Promise.all(background);
		expect(start).not.toHaveBeenCalled();
		expect(slack.chat.postEphemeral).not.toHaveBeenCalled();
	});

	it("ignores mentions posted by a bot", async () => {
		await event(eventRequest(mention(`<@${bot}>`, { bot_id: "B123" })));
		await Promise.all(background);
		expect(start).not.toHaveBeenCalled();
	});

	it("ignores a redelivered mention", async () => {
		const response = await event(
			eventRequest(mention(), {
				"x-slack-retry-num": "1",
				"x-slack-retry-reason": "http_timeout",
			}),
		);
		expect(response.status).toBe(200);
		await Promise.all(background);
		expect(start).not.toHaveBeenCalled();
	});

	it("reports invalid flags to the mentioning user without starting", async () => {
		await event(eventRequest(mention(`<@${bot}> --video-duration -2`)));
		await Promise.all(background);
		expect(start).not.toHaveBeenCalled();
		expect(slack.chat.postEphemeral).toHaveBeenCalledWith({
			channel,
			user,
			text: expect.stringContaining("--video-duration"),
		});
	});

	it("notifies the user when the story cannot be started", async () => {
		vi.mocked(start).mockRejectedValue(new Error("Start failed"));
		const response = await event(eventRequest(mention()));
		expect(response.status).toBe(200);
		await expect(Promise.all(background)).resolves.toBeDefined();
		expect(slack.chat.postEphemeral).toHaveBeenCalledWith(
			expect.objectContaining({ channel, user }),
		);
	});

	it("acknowledges the event even if the user cannot be notified", async () => {
		vi.mocked(start).mockRejectedValue(new Error("Start failed"));
		vi.mocked(slack.chat.postEphemeral).mockRejectedValue(
			new Error("channel_not_found"),
		);
		expect((await event(eventRequest(mention()))).status).toBe(200);
		await expect(Promise.all(background)).resolves.toBeDefined();
	});

	it("falls back to stripping every mention without authorizations", async () => {
		await event(
			eventRequest(mention(`<@${bot}> -t Pirates -t Space`, {}, false)),
		);
		await Promise.all(background);
		expect(start).toHaveBeenCalledWith(storytime, [
			channel,
			parseStorytimeArgs(["-t", "Pirates", "-t", "Space"]),
		]);
	});
});

describe("thread messages", () => {
	it("still resumes the story hook for a thread reply", async () => {
		const payload = threadReply();
		const response = await event(eventRequest(payload));
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("OK");
		expect(slackMessageHook.resume).toHaveBeenCalledWith(
			`slack-message-webhook:${channel}:${ts}`,
			expect.objectContaining({
				text: payload.event.text,
				ts: payload.event.ts,
				thread_ts: ts,
			}),
		);
		expect(start).not.toHaveBeenCalled();
	});

	it("ignores replies from bots", async () => {
		await event(eventRequest(threadReply({ bot_id: "B123" })));
		expect(slackMessageHook.resume).not.toHaveBeenCalled();
	});

	it("acknowledges replies in threads that are not stories", async () => {
		vi.mocked(slackMessageHook.resume).mockRejectedValue(
			new Error("hook not found"),
		);
		expect((await event(eventRequest(threadReply()))).status).toBe(200);
	});

	it("ignores top-level messages that are not mentions", async () => {
		const response = await event(
			eventRequest({
				type: "event_callback",
				event: { type: "message", channel, user, text: "hello", ts },
			}),
		);
		expect(response.status).toBe(200);
		expect(slackMessageHook.resume).not.toHaveBeenCalled();
		expect(start).not.toHaveBeenCalled();
	});
});
