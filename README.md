# Slack Productivity Bot

A multi-purpose Slack bot powered by Vercel Workflow for automating tasks, generating content, and fetching insights.

## Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/tiktokpost` | Generate TikTok content ideas | `/tiktokpost AI productivity tools` |
| `/insights` | Fetch PostHog metrics | `/insights last 7 days` |
| `/job` | Run background jobs | `/job fetch-trends` |
| `/wiki` | Query GitHub repo docs | `/wiki vercel/ai streaming` |
| `/storytime` | Create collaborative stories | `/storytime` |

## Available Jobs

- `fetch-trends` - Scrape TikTok trends via Apify
- `crawl-competitors` - Check competitor websites
- `sync-github` - Sync GitHub issues/PRs
- `generate-report` - Compile weekly metrics report
- `build` - Trigger production build

## Getting Started

### Prerequisites

- Node.js 18+ 
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
7. A beautiful storyboard image will be generated and shared

**Note**: The bot must be invited to a channel before the `/storytime` slash command will work in that channel.

![Slack Interface](./public/storytime-slack.png)

## Development

### Local Testing

The included `local.ts` script allows you to test the core story generation logic locally without using Slack or Vercel Workflows.

```bash
pnpm tsx local.ts
```

## Resources

- [Stateful Slack Bots with Vercel Workflow Guide](https://vercel.com/guides/stateful-slack-bots-with-vercel-workflow)
