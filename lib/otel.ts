import {
  type Span,
  SpanOptions,
  SpanStatusCode,
  trace,
} from "@opentelemetry/api";

const tracer = trace.getTracer("storytime");

export function spanned<T>(
  name: string,
  opts: SpanOptions,
  fn: (span: Span) => Promise<T>,
) {
  return tracer.startActiveSpan(name, opts, async (span) => {
    try {
      const value = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return value;
    } catch (e) {
      span.recordException(e as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: e instanceof Error ? e.message : String(e),
      });
      throw e;
    } finally {
      span.end();
    }
  });
}
