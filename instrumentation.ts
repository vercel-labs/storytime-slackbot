import { LangfuseSpanProcessor, ShouldExportSpan } from "@langfuse/otel";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

export async function register() {
	// Filter out NextJS infra spans, only export AI SDK spans
	const shouldExportSpan: ShouldExportSpan = (span) => {
		return span.otelSpan.instrumentationScope.name !== "next.js";
	};

	const langfuseSpanProcessor = new LangfuseSpanProcessor({
		publicKey: process.env.LANGFUSE_PUBLIC_KEY,
		secretKey: process.env.LANGFUSE_SECRET_KEY,
		baseUrl: process.env.LANGFUSE_BASE_URL || "https://us.cloud.langfuse.com",
		exportMode: "immediate", // Required for serverless
		shouldExportSpan,
	});

	const tracerProvider = new NodeTracerProvider({
		spanProcessors: [langfuseSpanProcessor],
	});

	tracerProvider.register();
	console.log("Langfuse OTEL instrumentation registered with keys:",
		process.env.LANGFUSE_PUBLIC_KEY ? "✓" : "✗");
}
