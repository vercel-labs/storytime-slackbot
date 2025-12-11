import { registerOTel } from "@vercel/otel";

registerOTel({ serviceName: "storytime-slackbot" });
