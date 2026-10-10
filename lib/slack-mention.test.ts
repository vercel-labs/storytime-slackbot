import { describe, expect, it } from "vitest";
import { stripBotMention } from "./slack-mention";

const bot = "U0BOT123";

describe("stripBotMention", () => {
	it("removes the bot's mention and trims the leftover ends", () => {
		expect(stripBotMention(`<@${bot}>`, bot)).toBe("");
		expect(stripBotMention(`<@${bot}> -t Pirates`, bot)).toBe("-t Pirates");
	});

	it("removes a mention from the middle of the message", () => {
		// The gap left behind is harmless: `stringToArgv` ignores extra spaces.
		expect(stripBotMention(`hey <@${bot}>, start a story`, bot)).toBe(
			"hey  , start a story",
		);
	});

	it("removes a labeled mention", () => {
		expect(stripBotMention(`<@${bot}|storytime> -t Space`, bot)).toBe(
			"-t Space",
		);
	});

	it("removes every mention of the bot in the message", () => {
		expect(stripBotMention(`<@${bot}> -t Pirates <@${bot}>`, bot)).toBe(
			"-t Pirates",
		);
	});

	it("keeps other users mentioned alongside the bot", () => {
		expect(stripBotMention(`<@${bot}> -t "a tale for <@U999>"`, bot)).toBe(
			'-t "a tale for <@U999>"',
		);
	});

	it("removes every user mention when the bot is unknown", () => {
		expect(stripBotMention(`<@${bot}> -t Pirates <@U999>`)).toBe("-t Pirates");
	});

	it("leaves channel links and special mentions alone", () => {
		expect(
			stripBotMention(`<@${bot}> <!here> read <#C123|general>`, bot),
		).toBe("<!here> read <#C123|general>");
	});

	it("keeps text that was never a mention", () => {
		expect(stripBotMention("-t Pirates", bot)).toBe("-t Pirates");
	});
});
