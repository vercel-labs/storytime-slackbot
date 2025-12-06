import { generateText, type ModelMessage, Output } from "ai";
import { z } from "zod";

const WikiResponseSchema = z.object({
	answer: z.string().describe("Answer to the question based on documentation"),
	sources: z.array(z.string()).describe("Relevant documentation sections"),
});

export async function queryWiki(
	repo: string,
	question: string,
): Promise<{ answer: string; sources?: string[] }> {
	"use step";

	console.log(`Wiki query for ${repo}: ${question}`);
	console.time("Wiki lookup");

	try {
		// Fetch from DeepWiki API
		const response = await fetch("https://api.devin.ai/ada/deepwiki/ask", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				repo,
				question,
			}),
		});

		if (response.ok) {
			const data = await response.json();
			console.timeEnd("Wiki lookup");
			return {
				answer: data.answer || "No answer found in documentation.",
				sources: data.sources || [],
			};
		}
	} catch (error) {
		console.error("DeepWiki fetch error:", error);
	}

	// Fallback: use AI to answer based on common knowledge
	console.log("Falling back to AI-based answer");
	const model = "anthropic/claude-sonnet-4";

	const messages: ModelMessage[] = [
		{
			role: "system",
			content: `You are a helpful documentation assistant for the GitHub repository ${repo}.
Answer questions based on your knowledge of this repository's documentation and APIs.
Be concise and practical. Include code examples when helpful.
If you're not sure about something specific to this repo, say so.`,
		},
		{
			role: "user",
			content: question,
		},
	];

	const result = await generateText({
		model,
		messages,
		experimental_output: Output.object({
			schema: WikiResponseSchema,
		}),
		experimental_telemetry: { isEnabled: true },
	});

	console.timeEnd("Wiki lookup");
	return result.experimental_output;
}
