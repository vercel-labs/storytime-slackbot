import Image from "next/image";

export default function Home() {
	return (
		<div className="font-sans flex items-center justify-center min-h-screen p-8 sm:p-20">
			<main className="flex flex-col gap-8 items-center text-center max-w-2xl">
				<Image
					src="/storytime.png"
					alt="Storytime Slack Bot"
					width={160}
					height={160}
					priority
					className="rounded-3xl shadow-lg"
				/>

				<div className="flex flex-col gap-4">
					<h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
						Storytime Slack Bot
					</h1>
					<p className="text-lg text-black/70 dark:text-white/70 leading-relaxed">
						An interactive AI-powered Slack bot that creates collaborative
						children&apos;s stories with your team. Start a story with{" "}
						<code className="bg-black/[.05] dark:bg-white/[.06] font-mono text-base px-1.5 py-0.5 rounded">
							/storytime
						</code>{" "}
						and contribute together in a thread &mdash; the bot wraps things up
						with a generated storyboard image.
					</p>
				</div>

				<div className="flex gap-4 items-center flex-col sm:flex-row mt-2">
					<a
						className="rounded-full border border-solid border-transparent transition-colors flex items-center justify-center bg-foreground text-background gap-2 hover:bg-[#383838] dark:hover:bg-[#ccc] font-medium text-sm sm:text-base h-11 sm:h-12 px-5 sm:px-6"
						href="https://github.com/vercel-labs/storytime-slackbot"
						target="_blank"
						rel="noopener noreferrer"
					>
						View on GitHub
					</a>
					<a
						className="rounded-full border border-solid border-black/[.08] dark:border-white/[.145] transition-colors flex items-center justify-center hover:bg-[#f2f2f2] dark:hover:bg-[#1a1a1a] hover:border-transparent font-medium text-sm sm:text-base h-11 sm:h-12 px-5 sm:px-6"
						href="https://vercel.com/guides/stateful-slack-bots-with-vercel-workflow"
						target="_blank"
						rel="noopener noreferrer"
					>
						Read the guide
					</a>
				</div>
			</main>
		</div>
	);
}
