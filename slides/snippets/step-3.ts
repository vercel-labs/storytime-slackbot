// 3. One directive turns it durable
import { generateText, Output } from "ai";
import { defineHook } from "workflow";
import { z } from "zod";

export const slackMessageHook = defineHook({
  schema: z.object({ text: z.string(), ts: z.string() }),
});

export async function storytime(channelId: string, ts: string) {
  "use workflow";

  const userInput = slackMessageHook.create({
    token: `slack-message-webhook:${channelId}:${ts}`,
  });

  const messages = [
    { role: "system", content: SYSTEM_PROMPT(themes) },
    { role: "user", content: "Let's start a new story." },
  ];

  let finalStory = "";

  for await (const data of userInput) {
    messages.push({ role: "user", content: data.text });

    const result = await generateText({
      model,
      messages,
      experimental_output: Output.object({ schema: StorytimeSchema }),
    });

    messages.push({ role: "assistant", content: result.text });

    if (result.experimental_output?.done) {
      finalStory = result.experimental_output.story;
      break;
    }
  }
}
