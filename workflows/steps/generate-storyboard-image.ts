import { openai } from "@ai-sdk/openai";
import { FatalError } from "@vercel/workflow-core";
import { experimental_generateImage as generateImage } from "ai";
import { IMAGE_GEN_PROMPT } from "@/lib/prompt";
import { slack } from "@/lib/slack";
import { type Span, SpanKind } from "@opentelemetry/api";
import { spanned, tracer } from "@/lib/otel";

export async function generateStoryboardImage(
  channelId: string,
  threadTs: string,
  finalStory: string,
) {
  "use step";

  console.time("Generating storyboard image");
  let span: Span;
  const file = await tracer
    .startActiveSpan(
      "generateStoryboardImage",
      { kind: SpanKind.CLIENT },
      async (s) => {
        span = s;
        span.setAttributes({
          "span.startTime": Date.now(),
          "span.startHrtime": process.hrtime(),
        });
        console.log({
          "span.startTime": Date.now(),
          "span.startHrtime": process.hrtime(),
        });
        console.time("inside spanned");
        const resp = await generateImage({
          model: openai.image("gpt-image-1"),
          n: 1,
          prompt: IMAGE_GEN_PROMPT(finalStory),
        });
        const b = Buffer.from(resp.images[0].uint8Array);
        console.timeEnd("inside spanned");
        return b;
      },
    )
    .finally(() => {
      console.log("ending span");
      span.setAttributes({
        "span.endTime": Date.now(),
        "span.endHrtime": process.hrtime(),
      });
      console.log({
        "span.endTime": Date.now(),
        "span.endHrtime": process.hrtime(),
      });
      span.end();
    });
  console.timeEnd("Generating storyboard image");

  console.time("Uploading image to Slack");
  const res = await spanned("uploadToSlack", { kind: SpanKind.CLIENT }, () =>
    slack.files.uploadV2({
      channel_id: channelId,
      thread_ts: threadTs,
      file,
      filename: "storyboard.png",
      title: "Storyboard",
    }),
  );
  console.timeEnd("Uploading image to Slack");

  if (!res.ok) {
    throw new FatalError(`Failed to upload file: ${res.error}`);
  }

  // @ts-expect-error - files is not typed
  return res.files[0].files[0].id as string;
}

export async function broadcastStoryboardImage(
  channelId: string,
  threadTs: string,
  fileId: string,
) {
  "use step";

  // Fetch replies in the thread
  const replies = await slack.conversations.replies({
    channel: channelId,
    ts: threadTs,
    limit: 200,
    inclusive: true,
  });

  const { messages } = replies;

  if (!replies.ok || !messages || messages.length === 0) {
    throw new FatalError(`Failed to fetch thread replies: ${replies.error}`);
  }

  // Find newest message posted by this bot in the thread
  const messageWithFile = messages.find((m) =>
    m.files?.find((f) => f.id === fileId),
  );

  if (!messageWithFile?.ts) {
    // Non-fatal error, so that this step gets retried
    throw new Error("Failed to find bot message in thread - retrying…");
  }

  // @ts-expect-error - Specifying only `reply_broadcast` is not properly typed
  await slack.chat.update({
    channel: channelId,
    ts: messageWithFile.ts,
    reply_broadcast: true,
  });
}
