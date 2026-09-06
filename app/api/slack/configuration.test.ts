import { createHmac } from "node:crypto";
import { waitUntil } from "@vercel/functions";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { start } from "workflow/api";
import { parseStorytimeArgs } from "@/lib/args";
import { modalSlack, slack } from "@/lib/slack";
import {
	buildStorytimeModal,
	parseStorytimeModal,
	STORYTIME_MODAL_CALLBACK,
} from "@/lib/storytime-modal";
import { storytime } from "@/workflows/create";
import { POST as command } from "./command/route";
import { POST as interact } from "./interactions/route";
import { POST as event } from "./webhook/route";

vi.mock("@vercel/functions", () => ({ waitUntil: vi.fn() }));
vi.mock("workflow/api", () => ({ start: vi.fn() }));
vi.mock("@/workflows/create", () => ({
	storytime: vi.fn(),
	slackMessageHook: { resume: vi.fn() },
}));
vi.mock("@/lib/slack", () => ({
	modalSlack: { views: { open: vi.fn(), update: vi.fn() } },
	slack: { chat: { postEphemeral: vi.fn() } },
}));

const secret = "test-secret";
const context = { channelId: "C123", userId: "U123", teamId: "T123" };
const defaults = parseStorytimeArgs(["-t", "Pirates", "-t", "Space"]);
let background: Promise<unknown>[] = [];

function signedRequest(body: string) {
	const timestamp = String(Math.floor(Date.now() / 1000));
	const signature = createHmac("sha256", secret)
		.update(`v0:${timestamp}:${body}`)
		.digest("hex");
	return new Request("https://example.com/api/slack", {
		method: "POST",
		body,
		headers: {
			"x-slack-request-timestamp": timestamp,
			"x-slack-signature": `v0=${signature}`,
		},
	});
}

function commandRequest(text = "") {
	return signedRequest(
		new URLSearchParams({
			text,
			trigger_id: "trigger",
			channel_id: context.channelId,
			user_id: context.userId,
			team_id: context.teamId,
		}).toString(),
	);
}

function submission(video = false) {
	const payload = {
		type: "view_submission",
		user: { id: context.userId },
		team: { id: context.teamId },
		view: {
			id: "V123",
			hash: "view-hash",
			callback_id: STORYTIME_MODAL_CALLBACK,
			private_metadata: buildStorytimeModal({ ...defaults, video }, context)
				.private_metadata!,
			state: {
				values: {
					output: {
						value: { selected_option: { value: video ? "video" : "image" } },
					},
					themes: { value: { value: defaults.themes.join("\n") } },
					style: { value: { value: "" } },
					model: { value: { value: defaults.model } },
					image_model: { value: { value: defaults.imageModel } },
					panels: { value: { selected_option: { value: "auto" } } },
					video_model: { value: { value: defaults.videoModel } },
					video_duration: { value: { value: "" } },
					thinking_emoji: { value: { value: defaults.thinkingEmoji } },
					transcripts: {
						value: { selected_options: [] as { value: string }[] },
					},
				},
			},
		},
	};
	for (const field of video
		? ["image_model", "panels"]
		: ["video_model", "video_duration"]) {
		Reflect.deleteProperty(payload.view.state.values, field);
	}
	return payload;
}

function outputChange(payload: ReturnType<typeof submission>, output: string) {
	return {
		...payload,
		type: "block_actions",
		actions: [
			{
				block_id: "output",
				action_id: "value",
				selected_option: { value: output },
			},
		],
	};
}

const interactionRequest = (payload: unknown) =>
	signedRequest(
		new URLSearchParams({ payload: JSON.stringify(payload) }).toString(),
	);

beforeEach(() => {
	vi.resetAllMocks();
	vi.stubEnv("SLACK_SIGNING_SECRET", secret);
	background = [];
	vi.mocked(waitUntil).mockImplementation((promise) => {
		background.push(promise);
	});
	vi.mocked(modalSlack.views.open).mockResolvedValue({ ok: true });
	vi.mocked(modalSlack.views.update).mockResolvedValue({ ok: true });
	vi.mocked(start).mockResolvedValue({ runId: "run" } as Awaited<
		ReturnType<typeof start>
	>);
});

afterEach(() => vi.unstubAllEnvs());

describe("configuration modal", () => {
	it("preselects the defaults for every option", () => {
		const view = buildStorytimeModal(defaults, context);
		expect(JSON.parse(view.private_metadata!)).toMatchObject(context);
		for (const [id, initialValue] of [
			["themes", "Pirates\nSpace"],
			["model", defaults.model],
			["image_model", defaults.imageModel],
			["thinking_emoji", "thinking_face"],
		]) {
			expect(view.blocks.find((block) => block.block_id === id)).toMatchObject({
				element: { initial_value: initialValue },
			});
		}
		expect(
			view.blocks.find((block) => block.block_id === "output"),
		).toMatchObject({
			dispatch_action: true,
			element: { initial_option: { value: "image" } },
		});
		expect(
			view.blocks.find((block) => block.block_id === "panels"),
		).toMatchObject({ element: { initial_option: { value: "auto" } } });
		for (const id of ["style"]) {
			expect(view.blocks.find((block) => block.block_id === id)).toMatchObject({
				element: expect.not.objectContaining({
					initial_value: expect.anything(),
				}),
			});
		}
		expect(
			view.blocks.find((block) => block.block_id === "transcripts"),
		).toMatchObject({
			element: expect.not.objectContaining({
				initial_options: expect.anything(),
			}),
		});
		expect(parseStorytimeModal(submission().view.state.values)).toEqual({
			args: defaults,
		});
		expect(
			view.blocks.some(
				(block) =>
					block.block_id === "video_model" ||
					block.block_id === "video_duration",
			),
		).toBe(false);
	});

	it("shows only video settings in video mode", () => {
		const view = buildStorytimeModal(
			{ ...defaults, video: true, videoDuration: 8 },
			context,
		);
		expect(
			view.blocks.find((block) => block.block_id === "video_model"),
		).toMatchObject({ element: { initial_value: defaults.videoModel } });
		expect(
			view.blocks.find((block) => block.block_id === "video_duration"),
		).toMatchObject({ element: { initial_value: "8" } });
		expect(
			view.blocks.some(
				(block) =>
					block.block_id === "image_model" || block.block_id === "panels",
			),
		).toBe(false);
		expect(parseStorytimeModal(submission(true).view.state.values)).toEqual({
			args: { ...defaults, video: true },
		});
	});

	it("preserves custom themes and styles without interpreting them as flags", () => {
		const values = submission().view.state.values;
		values.themes.value.value = "--video\nA pirate's tale";
		values.style.value.value = '--transcripts "pencil sketch"';
		expect(parseStorytimeModal(values)).toMatchObject({
			args: {
				themes: ["--video", "A pirate's tale"],
				style: '--transcripts "pencil sketch"',
				video: false,
				transcripts: false,
			},
		});
	});
});

describe("slash command", () => {
	it("opens a modal without starting a story", async () => {
		const response = await command(commandRequest());
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("");
		expect(modalSlack.views.open).toHaveBeenCalledOnce();
		expect(modalSlack.views.open).toHaveBeenCalledWith(
			expect.objectContaining({ trigger_id: "trigger" }),
		);
		expect(start).not.toHaveBeenCalled();
	});

	it("uses command flags to prefill the modal", async () => {
		await command(
			commandRequest(
				'--video -t Pirates -t Space --style "pencil sketch" --video-duration 8 --transcripts -p 6',
			),
		);
		const { view } = vi.mocked(modalSlack.views.open).mock.calls[0][0];
		expect(view).toEqual(
			buildStorytimeModal(
				parseStorytimeArgs([
					"--video",
					"-t",
					"Pirates",
					"-t",
					"Space",
					"--style",
					"pencil sketch",
					"--video-duration",
					"8",
					"--transcripts",
					"-p",
					"6",
				]),
				context,
			),
		);
		expect(start).not.toHaveBeenCalled();
	});

	it("reports invalid flags without opening or starting", async () => {
		const response = await command(commandRequest("--video-duration -2"));
		expect(await response.json()).toMatchObject({
			response_type: "ephemeral",
			text: expect.stringContaining("--video-duration"),
		});
		expect(modalSlack.views.open).not.toHaveBeenCalled();
		expect(start).not.toHaveBeenCalled();
	});

	it("reports modal opening failure", async () => {
		vi.mocked(modalSlack.views.open).mockRejectedValue(
			new Error("expired_trigger_id"),
		);
		const response = await command(commandRequest());
		expect(await response.json()).toMatchObject({
			response_type: "ephemeral",
			text: expect.stringContaining("Please try"),
		});
		expect(start).not.toHaveBeenCalled();
	});
});

describe("modal submission", () => {
	it("starts once in the original channel with the displayed defaults", async () => {
		const response = await interact(interactionRequest(submission()));
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("");
		expect(start).toHaveBeenCalledOnce();
		expect(start).toHaveBeenCalledWith(storytime, [
			context.channelId,
			defaults,
		]);
		expect(waitUntil).toHaveBeenCalledOnce();
	});

	it("passes edited video configuration through", async () => {
		const payload = submission(true);
		const values = payload.view.state.values;
		values.output.value.selected_option.value = "video";
		values.video_model.value.value = "custom/video-model";
		values.video_duration.value.value = "8";
		values.style.value.value = "claymation";
		values.transcripts.value.selected_options = [{ value: "enabled" }];
		await interact(interactionRequest(payload));
		expect(start).toHaveBeenCalledWith(storytime, [
			context.channelId,
			{
				...defaults,
				video: true,
				videoModel: "custom/video-model",
				videoDuration: 8,
				style: "claymation",
				transcripts: true,
			},
		]);
	});

	it.each(["0", "-1", "NaN"])(
		"shows a duration error for %s without starting",
		async (value) => {
			const payload = submission(true);
			payload.view.state.values.video_duration.value.value = value;
			const response = await interact(interactionRequest(payload));
			expect(await response.json()).toMatchObject({
				response_action: "errors",
				errors: { video_duration: expect.any(String) },
			});
			expect(start).not.toHaveBeenCalled();
		},
	);

	it("shows panel and required-field errors", () => {
		const values = submission().view.state.values;
		values.panels.value.selected_option.value = "13";
		expect(parseStorytimeModal(values)).toMatchObject({
			errors: { panels: expect.any(String) },
		});
		values.model.value.value = "  ";
		expect(parseStorytimeModal(values)).toMatchObject({
			errors: { model: expect.any(String) },
		});
	});

	it("does nothing on dismissal", async () => {
		const response = await interact(
			interactionRequest({ type: "view_closed" }),
		);
		expect(response.status).toBe(200);
		expect(start).not.toHaveBeenCalled();
	});

	it("rejects mismatched submitter context", async () => {
		const payload = submission();
		payload.user.id = "another-user";
		expect((await interact(interactionRequest(payload))).status).toBe(403);
		expect(start).not.toHaveBeenCalled();
	});

	it("accepts org-installed submissions whose team is null", async () => {
		const response = await interact(
			interactionRequest({ ...submission(), team: null }),
		);
		expect(response.status).toBe(200);
		expect(start).toHaveBeenCalledWith(storytime, [
			context.channelId,
			defaults,
		]);
	});

	it("rejects a mismatched workspace when Slack supplies one", async () => {
		const payload = submission();
		payload.team.id = "another-team";
		expect((await interact(interactionRequest(payload))).status).toBe(403);
		expect(start).not.toHaveBeenCalled();
	});

	it("rejects malformed payloads", async () => {
		expect((await interact(signedRequest("payload=not-json"))).status).toBe(
			400,
		);
		const payload = submission();
		payload.view.private_metadata = "invalid";
		expect((await interact(interactionRequest(payload))).status).toBe(400);
		expect(start).not.toHaveBeenCalled();
	});

	it("notifies the user if background startup fails", async () => {
		vi.mocked(start).mockRejectedValue(new Error("Start failed"));
		expect((await interact(interactionRequest(submission()))).status).toBe(200);
		await Promise.all(background);
		expect(slack.chat.postEphemeral).toHaveBeenCalledWith(
			expect.objectContaining({
				channel: context.channelId,
				user: context.userId,
			}),
		);
	});
});

describe("output selection", () => {
	it("updates the view in place and restores edited values when switching back", async () => {
		const image = submission();
		image.view.state.values.image_model.value.value = "custom/image";
		image.view.state.values.panels.value.selected_option.value = "8";
		image.view.state.values.style.value.value = "watercolor";
		const response = await interact(
			interactionRequest(outputChange(image, "video")),
		);
		expect(response.status).toBe(200);
		await Promise.all(background);
		const update = vi.mocked(modalSlack.views.update).mock.calls[0][0];
		expect(update).toMatchObject({ view_id: "V123", hash: "view-hash" });
		expect(
			update.view.blocks.some((block) => block.block_id === "image_model"),
		).toBe(false);
		expect(
			update.view.blocks.find((block) => block.block_id === "video_model"),
		).toMatchObject({ element: { initial_value: defaults.videoModel } });
		expect(
			update.view.blocks.find((block) => block.block_id === "style"),
		).toMatchObject({ element: { initial_value: "watercolor" } });

		const video = submission(true);
		video.view.private_metadata = update.view.private_metadata!;
		video.view.hash = "new-hash";
		video.view.state.values.video_model.value.value = "custom/video";
		video.view.state.values.video_duration.value.value = "12";
		await interact(interactionRequest(outputChange(video, "image")));
		await Promise.all(background);
		const restored = vi.mocked(modalSlack.views.update).mock.calls[1][0].view;
		expect(
			restored.blocks.find((block) => block.block_id === "image_model"),
		).toMatchObject({ element: { initial_value: "custom/image" } });
		expect(
			restored.blocks.find((block) => block.block_id === "panels"),
		).toMatchObject({ element: { initial_option: { value: "8" } } });
		expect(
			restored.blocks.some((block) => block.block_id === "video_model"),
		).toBe(false);
		image.view.private_metadata = restored.private_metadata!;
		await interact(interactionRequest(outputChange(image, "video")));
		await Promise.all(background);
		const restoredVideo = vi.mocked(modalSlack.views.update).mock.calls[2][0]
			.view;
		expect(
			restoredVideo.blocks.find((block) => block.block_id === "video_model"),
		).toMatchObject({ element: { initial_value: "custom/video" } });
		expect(
			restoredVideo.blocks.find((block) => block.block_id === "video_duration"),
		).toMatchObject({ element: { initial_value: "12" } });
		expect(start).not.toHaveBeenCalled();
	});

	it("preserves cleared shared fields and doesn't store them in metadata", async () => {
		const image = submission();
		image.view.state.values.themes.value.value = "";
		image.view.state.values.style.value.value = "";
		await interact(interactionRequest(outputChange(image, "video")));
		await Promise.all(background);
		const view = vi.mocked(modalSlack.views.update).mock.calls[0][0].view;
		for (const id of ["themes", "style"]) {
			expect(view.blocks.find((block) => block.block_id === id)).toMatchObject({
				element: expect.not.objectContaining({
					initial_value: expect.anything(),
				}),
			});
		}
		expect(JSON.parse(view.private_metadata!)).not.toHaveProperty("themes");
	});

	it("lets users leave unfinished video fields and submit an image", async () => {
		const video = submission(true);
		video.view.state.values.video_model.value.value = "";
		video.view.state.values.video_duration.value.value = "0";
		await interact(interactionRequest(outputChange(video, "image")));
		await Promise.all(background);
		const image = submission();
		image.view.private_metadata = vi.mocked(
			modalSlack.views.update,
		).mock.calls[0][0].view.private_metadata!;
		expect((await interact(interactionRequest(image))).status).toBe(200);
		expect(start).toHaveBeenCalledWith(storytime, [
			context.channelId,
			defaults,
		]);
		await interact(interactionRequest(outputChange(image, "video")));
		await Promise.all(background);
		const restored = vi.mocked(modalSlack.views.update).mock.calls[1][0].view;
		expect(
			restored.blocks.find((block) => block.block_id === "video_model"),
		).toMatchObject({
			element: expect.not.objectContaining({
				initial_value: expect.anything(),
			}),
		});
		expect(
			restored.blocks.find((block) => block.block_id === "video_duration"),
		).toMatchObject({ element: { initial_value: "0" } });
	});

	it("shows the newly selected fields if submitted before the view update arrives", async () => {
		const payload = submission();
		payload.view.state.values.output.value.selected_option.value = "video";
		const response = await interact(interactionRequest(payload));
		const body = await response.json();
		expect(body.response_action).toBe("update");
		expect(body.view.blocks).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ block_id: "video_model" }),
			]),
		);
		expect(start).not.toHaveBeenCalled();
	});

	it("acknowledges failed or stale updates without starting a story", async () => {
		vi.mocked(modalSlack.views.update).mockRejectedValue(
			new Error("hash_conflict"),
		);
		expect(
			(await interact(interactionRequest(outputChange(submission(), "video"))))
				.status,
		).toBe(200);
		await expect(Promise.all(background)).resolves.toBeDefined();
		expect(start).not.toHaveBeenCalled();
	});
});

it.each([command, interact, event])(
	"rejects unsigned Slack requests",
	async (handler) => {
		expect(
			(
				await handler(
					new Request("https://example.com", { method: "POST", body: "{}" }),
				)
			).status,
		).toBe(401);
		expect(start).not.toHaveBeenCalled();
		expect(modalSlack.views.open).not.toHaveBeenCalled();
	},
);

it("accepts signed Events API URL verification", async () => {
	const response = await event(
		signedRequest(
			JSON.stringify({ type: "url_verification", challenge: "test-challenge" }),
		),
	);
	expect(await response.text()).toBe("test-challenge");
});
