// 1. Local CLI baseline
import { createReadlineIterator } from "./readline.js";
import { generateText, Output } from "ai";

const userInput = createReadlineIterator("Enter your story piece: ");

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
