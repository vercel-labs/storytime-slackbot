import { LangfuseSpanProcessor, ShouldExportSpan } from "@langfuse/otel";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

// Filter out NextJS infra spans, only export AI SDK spans
const shouldExportSpan: ShouldExportSpan = (span) => {
	return span.otelSpan.instrumentationScope.name !== "next.js";
};

export const langfuseSpanProcessor = new LangfuseSpanProcessor({
	shouldExportSpan,
});

const tracerProvider = new NodeTracerProvider({
	spanProcessors: [langfuseSpanProcessor],
});

tracerProvider.register();
