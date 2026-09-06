# Storytime Slack Bot

<img align="right" width="200" height="200" src="./public/storytime.png">

An interactive AI-powered Slack bot that creates collaborative children's stories with your team. The `/storytime` slash command opens a configuration modal with defaults pre-selected. Submit it to start a story.

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

6. In **Interactivity & Shortcuts**, enable interactivity and set the Request URL to `https://your-domain.vercel.app/api/slack/interactions`
7. Install the app to your workspace and copy the Bot User OAuth Token
8. Copy the **Signing Secret** from **Basic Information > App Credentials** for the environment configuration below

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
SLACK_SIGNING_SECRET=your_slack_signing_secret
AI_GATEWAY_API_KEY=your_ai_gateway_api_key
```

`SLACK_SIGNING_SECRET` is required to verify slash commands, modal submissions, and Events API requests. Set it before configuring or verifying the Slack request URLs. Existing installations must also add this variable when upgrading.

AI Gateway request transcripts are disabled by default. To opt in for a session, first enable transcripts in your team's AI Gateway settings, then check **Record Gateway request transcripts** in the modal. `/storytime --transcripts` pre-selects that checkbox; the local script supports `pnpm tsx local.ts --transcripts`. Transcripts record prompts, files, and outputs for the session's story and image or video requests, including participants' contributions. This applies to new requests only and does not enable audio transcription.

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
- Interactivity & Shortcuts Request URL: `https://your-app.vercel.app/api/slack/interactions`

## How to Use

1. First, invite the bot to your channel: Type `@Storytime Bot` (or whatever you named your app) in the channel and Slack will give you the option to invite it
2. In any Slack channel where the bot is present, type `/storytime`
3. Review the configuration modal. It includes output mode, themes, visual style, models, panel count, video duration, thinking emoji, and transcripts, with current defaults filled in
4. Click **Start Story** to generate the introduction in the original channel. Canceling the modal does not start a story
5. Reply in the thread to add your part of the story
6. The bot will respond with encouragement and continue the narrative
7. After 2-3 iterations, the bot will conclude the story
8. The selected storyboard image or video will be generated and shared

![Storyboard Example](./public/storyboard.png)

**Note**: The bot must be invited to a channel before the `/storytime` slash command will work in that channel.

### Command Options

The `/storytime` command supports optional flags to pre-fill the configuration modal. Flags do not skip the modal; click **Start Story** to confirm. Image and video settings are shown together, but only the selected output mode's settings are used.

| Flag               | Alias | Description                                                                                              |
| ------------------ | ----- | -------------------------------------------------------------------------------------------------------- |
| `--theme`          | `-t`  | Story theme (can be specified multiple times). Defaults to 2 random themes if fewer than 2 are provided. |
| `--model`          | `-m`  | Text generation model. Default: `anthropic/claude-haiku-4.5`                                            |
| `--image-model`    | `-i`  | Image generation model. Default: `google/gemini-3-pro-image`                                             |
| `--style`          | `-s`  | Visual style for the generated image or video (e.g., "watercolor", "pencil sketch", "claymation").       |
| `--video`          |       | Generate a video instead of the final storyboard image.                                                |
| `--video-model`    |       | Video generation model used with `--video`. Default: `google/veo-3.1-generate-001`                       |
| `--video-duration` |       | Video duration in seconds, used with `--video`. Must be positive; supported values depend on the model. Omit to use the model's default. |
| `--transcripts`    |       | Enable Gateway request transcripts for this session. Off by default; requires transcripts enabled in the team's AI Gateway settings. |
| `--panels`         | `-p`  | Number of panels in the final storyboard image (integer, 2–12). Default: 4–5 panels.                     |
| `--thinking-emoji` | `-e`  | Emoji shown while processing. Default: `thinking_face` 🤔                                                |

The `--model` and `--image-model` flags accept [AI Gateway model specifiers](https://vercel.com/ai-gateway/models) (e.g., `anthropic/claude-sonnet-4`, `openai/gpt-4.1-mini`, `google/gemini-2.5-flash`).

The `--video-model` flag also accepts an AI Gateway model specifier. The model must support asynchronous video generation with webhooks. Video generation uses `experimental_generateVideo` from `@ai-sdk/workflow/video`: the workflow suspends while the video renders, then uploads the result to the Slack thread and broadcasts it to the channel. It uses the same `AI_GATEWAY_API_KEY`; no additional provider key is required.

The `--style` option applies to both image and video output. The `--image-model` and `--panels` options only affect image output. Without `--video`, the bot continues to generate a storyboard image.

The provider must be able to reach the generated `/.well-known/workflow/v1/webhook/...` URL. The installed Workflow SDK uses the deployment-specific `VERCEL_URL` hostname, not the project's custom domain. Deployment Protection on that hostname can reject Gateway callbacks with HTTP 401 even when the custom domain is public. Test video generation on a deployment where protection does not block the Workflow webhook endpoint.

**Examples:**

```
/storytime
/storytime --video
/storytime --video --transcripts
/storytime --video --video-duration 8
/storytime --video --style claymation
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

The local script accepts the same `--theme`, `--model`, `--image-model`, `--style` (including `-s`), `--panels`, and `--transcripts` flags as the Slack command.

The local script does not support `--video`, which needs a running Workflow runtime and a publicly reachable webhook. Test video generation through the Slack command instead.

Run the automated tests with `pnpm test`.

## Resources

- [Stateful Slack Bots with Vercel Workflow Guide](https://vercel.com/guides/stateful-slack-bots-with-vercel-workflow)
