# Storytime Slack Bot

<img align="right" width="200" height="200" src="./public/storytime.png">

An interactive AI-powered Slack bot that creates collaborative children's stories with your team. Users can start a story with a slash command, and the bot will generate an introduction based on random themes.

Team members can then contribute to the story in a thread, with the AI helping to guide the narrative to completion and generating a storyboard image at the end. Use `/storytime --video` to generate an animated video instead.

## Getting Started

### Prerequisites

- Node.js 22.12+
- pnpm (recommended) or npm
- A Slack workspace where you can install apps
- Vercel account for deployment

### 1. Clone the Repository

```bash
git clone https://github.com/vercel/storytime-slackbot.git
cd storytime-slackbot
pnpm install
```

### 2. Set Up Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and create a new app
2. Choose "From scratch" and select your workspace
3. In **OAuth & Permissions**, add these Bot Token Scopes:
   - `chat:write`
   - `files:write`
   - `reactions:write`
   - `channels:history`
   - `groups:history`
   - `im:history`
   - `mpim:history`

4. In **Event Subscriptions**:
   - Enable events
   - Set Request URL to: `https://your-domain.vercel.app/api/slack/webhook`
   - Subscribe to `message.channels` workspace event

5. In **Slash Commands**, create a new command:
   - Command: `/storytime`
   - Request URL: `https://your-domain.vercel.app/api/slack/command`
   - Description: "Start a collaborative story"

6. Install the app to your workspace and copy the Bot User OAuth Token

### 3. Set Up AI Gateway API Key

1. Navigate to the [Vercel Dashboard](https://vercel.com/dashboard) and go to the AI Gateway tab
2. Click "API keys" in the left sidebar
3. Click "Create key" to generate a new API key
4. Save the API key for the next step

For more details, see the [AI Gateway Authentication documentation](https://vercel.com/docs/ai-gateway/authentication#creating-an-api-key).

### 4. Environment Variables

Create a `.env.local` file:

```bash
SLACK_BOT_TOKEN=xoxb-your-bot-token-here
AI_GATEWAY_API_KEY=your_ai_gateway_api_key
```

### 5. Development

```bash
pnpm dev
```

The app will be available at [http://localhost:3000](http://localhost:3000).

For local development with Slack webhooks, use a tool like [ngrok](https://ngrok.com/) to expose your local server:

```bash
ngrok http 3000
```

Then update your Slack app's webhook URLs to use the ngrok URL.

## Deployment

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel-labs%2Fstorytime-slackbot)

### Update Slack App URLs

After deployment, update your Slack app configuration:

- Event Subscriptions Request URL: `https://your-app.vercel.app/api/slack/webhook`
- Slash Command Request URL: `https://your-app.vercel.app/api/slack/command`

## How to Use

1. First, invite the bot to your channel: Type `@Storytime Bot` (or whatever you named your app) in the channel and Slack will give you the option to invite it
2. In any Slack channel where the bot is present, type `/storytime`
3. The bot will generate a story introduction with random themes
4. Reply in the thread to add your part of the story
5. The bot will respond with encouragement and continue the narrative
6. After 2-3 iterations, the bot will conclude the story
7. A storyboard image (or a video when using `--video`) will be generated and shared

![Storyboard Example](./public/storyboard.png)

**Note**: The bot must be invited to a channel before the `/storytime` slash command will work in that channel.

### Command Options

The `/storytime` command supports several optional flags:

| Flag               | Alias | Description                                                                                              |
| ------------------ | ----- | -------------------------------------------------------------------------------------------------------- |
| `--theme`          | `-t`  | Story theme (can be specified multiple times). Defaults to 2 random themes if fewer than 2 are provided. |
| `--model`          | `-m`  | Text generation model. Default: `meta/llama-4-scout`                                                     |
| `--image-model`    | `-i`  | Image generation model. Default: `google/gemini-3-pro-image`                                             |
| `--image-style`    | `-s`  | Art style for the generated storyboard image (e.g., "Dr. Seuss", "coloring book", "watercolor").         |
| `--video`          |       | Generate a video instead of the final storyboard image.                                                |
| `--video-model`    |       | Video generation model used with `--video`. Default: `klingai/kling-v3.0-t2v`                            |
| `--panels`         | `-p`  | Number of panels in the final storyboard image (integer, 2–12). Default: 4–5 panels.                     |
| `--thinking-emoji` | `-e`  | Emoji shown while processing. Default: `thinking_face` 🤔                                                |

The `--model` and `--image-model` flags accept [AI Gateway model specifiers](https://vercel.com/ai-gateway/models) (e.g., `anthropic/claude-sonnet-4`, `openai/gpt-4.1-mini`, `google/gemini-2.5-flash`).

The `--video-model` flag also accepts an AI Gateway model specifier. The model must support asynchronous video generation with webhooks. Video generation uses `experimental_generateVideo` from `@ai-sdk/workflow/video`: the workflow suspends while the video renders, then uploads the result to the Slack thread and broadcasts it to the channel. It uses the same `AI_GATEWAY_API_KEY`; no additional provider key is required.

The `--image-model`, `--image-style`, and `--panels` options only affect image output, not video output. Without `--video`, the bot continues to generate a storyboard image.

The provider must be able to reach the generated `/.well-known/workflow/v1/webhook/...` URL. Test video generation on a public deployment where deployment protection does not block the Workflow webhook endpoint.

**Examples:**

```
/storytime
/storytime --video
/storytime --video -t Pirates -t Space
/storytime --video --video-model klingai/kling-v3.0-t2v
/storytime -t Pirates
/storytime -t Pirates -t Space
/storytime -t Magic -t Dragons -t Friendship
/storytime -t Adventure -m anthropic/claude-sonnet-4
/storytime -t Fantasy -s "Dr. Seuss"
/storytime -s "coloring book"
/storytime -p 8
/storytime -t Pirates -s watercolor -p 6
```

![Slack Interface](./public/storytime-slack.png)

## Development

### Local Testing

The included `local.ts` script allows you to test the core story generation logic locally without using Slack or Vercel Workflows.

```bash
# Default (2 random themes)
pnpm tsx local.ts

# With custom themes
pnpm tsx local.ts -t Pirates -t Space

# With custom model
pnpm tsx local.ts -t Magic -m anthropic/claude-sonnet-4
```

The local script accepts the same `--theme`, `--model`, `--image-model`, `--image-style`, and `--panels` flags as the Slack command.

The local script does not support `--video`, which needs a running Workflow runtime and a publicly reachable webhook. Test video generation through the Slack command instead.

Run the automated tests with `pnpm test`.

## Resources

- [Stateful Slack Bots with Vercel Workflow Guide](https://vercel.com/guides/stateful-slack-bots-with-vercel-workflow)
