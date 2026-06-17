export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContext = Record<string, unknown>;

export type LogRecord = {
  level: LogLevel;
  component: string;
  eventName: string;
  message?: string;
  correlationId?: string;
  runId?: string;
  jobId?: string;
  context?: LogContext;
  occurredAt?: Date;
};

export type PersistedLogRecord = Required<Pick<LogRecord, "level" | "component" | "eventName">> & {
  message: string | null;
  correlationId: string | null;
  runId: string | null;
  jobId: string | null;
  context: LogContext;
  occurredAt: Date;
};

export interface LogSink {
  write(record: PersistedLogRecord): Promise<void>;
}

export interface AppLogger {
  log(record: LogRecord): Promise<void>;
  debug(eventName: string, context?: LogContext, message?: string): Promise<void>;
  info(eventName: string, context?: LogContext, message?: string): Promise<void>;
  warn(eventName: string, context?: LogContext, message?: string): Promise<void>;
  error(eventName: string, context?: LogContext, message?: string): Promise<void>;
  child(bindings: Partial<Pick<LogRecord, "component" | "correlationId" | "runId" | "jobId">>): AppLogger;
}

export type QueryExecutor = {
  query(sql: string, params: unknown[]): Promise<unknown>;
};

const sensitiveKeyPattern =
  /(^|_|\b)(password|passwd|cookie|authorization|authheader|auth_header|bearer|token|secret|privatekey|private_key|serviceaccount|service_account|fullhtml|full_html|pagehtml|page_html|rawhtml|raw_html|htmlbody|html_body)($|_|\b)/i;

export class StructuredLogger implements AppLogger {
  constructor(
    private readonly sink: LogSink,
    private readonly defaults: Partial<Pick<LogRecord, "component" | "correlationId" | "runId" | "jobId">> = {},
  ) {}

  async log(record: LogRecord): Promise<void> {
    const merged = { ...this.defaults, ...record };
    await this.sink.write({
      level: merged.level,
      component: merged.component ?? "app",
      eventName: merged.eventName,
      message: merged.message ?? null,
      correlationId: merged.correlationId ?? null,
      runId: merged.runId ?? null,
      jobId: merged.jobId ?? null,
      context: sanitizeLogContext(merged.context ?? {}),
      occurredAt: merged.occurredAt ?? new Date(),
    });
  }

  debug(eventName: string, context?: LogContext, message?: string): Promise<void> {
    return this.log({ level: "debug", eventName, component: this.defaults.component ?? "app", context, message });
  }

  info(eventName: string, context?: LogContext, message?: string): Promise<void> {
    return this.log({ level: "info", eventName, component: this.defaults.component ?? "app", context, message });
  }

  warn(eventName: string, context?: LogContext, message?: string): Promise<void> {
    return this.log({ level: "warn", eventName, component: this.defaults.component ?? "app", context, message });
  }

  error(eventName: string, context?: LogContext, message?: string): Promise<void> {
    return this.log({ level: "error", eventName, component: this.defaults.component ?? "app", context, message });
  }

  child(bindings: Partial<Pick<LogRecord, "component" | "correlationId" | "runId" | "jobId">>): AppLogger {
    return new StructuredLogger(this.sink, { ...this.defaults, ...bindings });
  }
}

export class CompositeLogSink implements LogSink {
  constructor(private readonly sinks: LogSink[]) {}

  async write(record: PersistedLogRecord): Promise<void> {
    await Promise.all(this.sinks.map((sink) => sink.write(record)));
  }
}

export class ConsoleJsonLogSink implements LogSink {
  constructor(private readonly writer: Pick<Console, "log" | "error"> = console) {}

  async write(record: PersistedLogRecord): Promise<void> {
    const line = JSON.stringify({
      ...record,
      occurredAt: record.occurredAt.toISOString(),
    });
    if (record.level === "error") {
      this.writer.error(line);
      return;
    }
    this.writer.log(line);
  }
}

export class InMemoryLogSink implements LogSink {
  readonly records: PersistedLogRecord[] = [];

  async write(record: PersistedLogRecord): Promise<void> {
    this.records.push(record);
  }
}

export class PostgresLogSink implements LogSink {
  constructor(private readonly executor: QueryExecutor) {}

  async write(record: PersistedLogRecord): Promise<void> {
    await this.executor.query(
      `
        INSERT INTO service_log_event (
          correlation_id,
          run_id,
          job_id,
          component,
          level,
          event_name,
          message,
          context,
          occurred_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      `,
      [
        record.correlationId,
        record.runId,
        record.jobId,
        record.component,
        record.level,
        record.eventName,
        record.message,
        JSON.stringify(record.context),
        record.occurredAt.toISOString(),
      ],
    );
  }
}

export function createAppLogger(options: {
  component: string;
  sinks: LogSink[];
  correlationId?: string;
  runId?: string;
  jobId?: string;
}): AppLogger {
  return new StructuredLogger(new CompositeLogSink(options.sinks), {
    component: options.component,
    correlationId: options.correlationId,
    runId: options.runId,
    jobId: options.jobId,
  });
}

export function sanitizeLogContext(context: LogContext): LogContext {
  return sanitizeValue(context) as LogContext;
}

function sanitizeValue(value: unknown, key = ""): unknown {
  if (sensitiveKeyPattern.test(key)) {
    return "[REDACTED]";
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeValue(entryValue, entryKey),
      ]),
    );
  }
  if (typeof value === "string" && value.length > 2000) {
    return `${value.slice(0, 2000)}...[truncated]`;
  }
  return value;
}
