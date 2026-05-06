import readline from "node:readline/promises";

export async function* createReadlineIterator(prompt: string) {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});
	try {
		while (true) {
			const text = await rl.question(prompt);
			yield { text };
		}
	} finally {
		rl.close();
	}
}
