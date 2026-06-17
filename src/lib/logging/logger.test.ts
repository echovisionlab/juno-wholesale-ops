import { describe, expect, it, vi } from "vitest";
import {
  CompositeLogSink,
  ConsoleJsonLogSink,
  createAppLogger,
  InMemoryLogSink,
  PostgresLogSink,
  sanitizeLogContext,
  StructuredLogger,
  type PersistedLogRecord,
} from "./logger";

describe("structured logger", () => {
  it("redacts sensitive fields and truncates long strings", () => {
    const sanitized = sanitizeLogContext({
      password: "secret",
      cookie: "session",
      productKey: "1148569-01",
      nested: { private_key: "key", value: "ok" },
      list: [{ token: "token" }],
      text: "a".repeat(2001),
    });

    expect(sanitized).toMatchObject({
      password: "[REDACTED]",
      cookie: "[REDACTED]",
      productKey: "1148569-01",
      nested: { private_key: "[REDACTED]", value: "ok" },
      list: [{ token: "[REDACTED]" }],
    });
    expect(String(sanitized.text)).toHaveLength(2014);
  });

  it("fans out records to multiple sinks and supports child bindings", async () => {
    const first = new InMemoryLogSink();
    const second = new InMemoryLogSink();
    const logger = createAppLogger({
      component: "root",
      correlationId: "corr-1",
      sinks: [first, second],
    }).child({ component: "worker", runId: "run-1" });

    await logger.info("job.claim", { count: 2 });
    await logger.warn("job.retry", { count: 1 }, "retrying");
    await logger.debug("lookup.delay");

    expect(first.records).toHaveLength(3);
    expect(second.records).toHaveLength(3);
    expect(first.records[0]).toMatchObject({
      component: "worker",
      correlationId: "corr-1",
      runId: "run-1",
      level: "info",
      eventName: "job.claim",
      context: { count: 2 },
    });
    expect(first.records[1].message).toBe("retrying");
    expect(first.records[2].level).toBe("debug");
  });

  it("writes JSON to stdout and errors to stderr", async () => {
    const writer = { log: vi.fn(), error: vi.fn() };
    const sink = new ConsoleJsonLogSink(writer);
    const baseRecord = record({ level: "info", eventName: "info.event" });

    await sink.write(baseRecord);
    await sink.write(record({ level: "error", eventName: "error.event" }));

    expect(writer.log).toHaveBeenCalledWith(expect.stringContaining('"eventName":"info.event"'));
    expect(writer.error).toHaveBeenCalledWith(expect.stringContaining('"eventName":"error.event"'));
  });

  it("persists log records through the Postgres sink", async () => {
    const executor = { query: vi.fn().mockResolvedValue({}) };
    const sink = new PostgresLogSink(executor);

    await sink.write(record({ context: { displayStock: "N/A" } }));

    expect(executor.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO service_log_event"), [
      "corr-1",
      "run-1",
      "job-1",
      "worker",
      "info",
      "parse.result",
      null,
      JSON.stringify({ displayStock: "N/A" }),
      "2026-06-17T00:00:00.000Z",
    ]);
  });

  it("can be constructed directly with a single sink", async () => {
    const sink = new InMemoryLogSink();
    const logger = new StructuredLogger(new CompositeLogSink([sink]));

    await logger.debug("debug.event");
    await logger.info("info.event");
    await logger.warn("warn.event");
    await logger.error("failure", { fullHtml: "<html></html>" }, "failed");
    await logger.log({ level: "info", eventName: "raw.event" } as Parameters<StructuredLogger["log"]>[0]);

    expect(sink.records.map((record) => record.component)).toEqual(["app", "app", "app", "app", "app"]);
    expect(sink.records[3]).toMatchObject({
      component: "app",
      level: "error",
      eventName: "failure",
      message: "failed",
      context: { fullHtml: "[REDACTED]" },
    });
    expect(sink.records[4]).toMatchObject({ eventName: "raw.event", component: "app" });
  });
});

function record(overrides: Partial<PersistedLogRecord> = {}): PersistedLogRecord {
  return {
    level: "info",
    component: "worker",
    eventName: "parse.result",
    message: null,
    correlationId: "corr-1",
    runId: "run-1",
    jobId: "job-1",
    context: {},
    occurredAt: new Date("2026-06-17T00:00:00.000Z"),
    ...overrides,
  };
}
