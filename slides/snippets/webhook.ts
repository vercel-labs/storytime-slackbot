// app/api/slack/webhook/route.ts
import { slackMessageHook } from "@/workflows/create";

export async function POST(req: Request) {
  const body = await req.json();
  const { channel, thread_ts, text, ts } = body.event;

  const token = `slack-message-webhook:${channel}:${thread_ts}`;
  await slackMessageHook.resume(token, { text, ts });

  return new Response("OK");
}
