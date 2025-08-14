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
    const startTime = Date.now();
    const startHrtime = process.hrtime.bigint();

    span.setAttributes({
      "span.startTime": Date.now(),
      "span.startHrtime": process.hrtime(),
    });

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
      const timeDiff = process.hrtime.bigint() - startHrtime;
      const timeDiffInMilliseconds = Number(timeDiff) / 1e6;
      span.setAttributes({
        "span.endHrtime": process.hrtime(),
        "span.endTime": Date.now(),
        "span.duration": timeDiffInMilliseconds,
        "span.calculatedEndTime": startTime + timeDiffInMilliseconds,
      });
      span.end(startTime + timeDiffInMilliseconds);
    }
  });
}
