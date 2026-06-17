import { Pool } from "pg";
import type {
  NotificationChannelType,
  NotificationConfig,
  NotificationDeliveryStatus,
  NotificationDispatchMode,
  NotificationDispatchResult,
} from "./types";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

type DispatchDeliveryRow = {
  id: string;
  channel_id: string | null;
  channel_name: string | null;
  channel_type: NotificationChannelType | null;
  channel_enabled: boolean | null;
  channel_config: NotificationConfig;
  secret_ref: string | null;
  subject: string;
  body: string;
  payload: NotificationConfig;
};

export async function dispatchQueuedNotifications(options: {
  databaseUrl: string;
  mode: NotificationDispatchMode;
  limit?: number;
  fetchImpl?: FetchLike;
  writer?: Pick<Console, "log">;
  env?: Record<string, string | undefined>;
}): Promise<NotificationDispatchResult> {
  const pool = new Pool({ connectionString: options.databaseUrl, max: 2 });
  try {
    const deliveries = await loadQueuedDeliveries(pool, options.limit ?? 100);
    if (options.mode === "dry-run") {
      return { sent: 0, failed: 0, skipped: deliveries.length, dryRun: true };
    }

    const result: NotificationDispatchResult = { sent: 0, failed: 0, skipped: 0, dryRun: false };
    for (const delivery of deliveries) {
      const outcome = await dispatchDelivery(pool, delivery, {
        fetchImpl: options.fetchImpl ?? fetch,
        writer: options.writer ?? console,
        env: options.env ?? process.env,
      });
      result[outcome] += 1;
    }
    return result;
  } finally {
    await pool.end();
  }
}

async function dispatchDelivery(
  pool: Pool,
  delivery: DispatchDeliveryRow,
  options: {
    fetchImpl: FetchLike;
    writer: Pick<Console, "log">;
    env: Record<string, string | undefined>;
  },
): Promise<"sent" | "failed" | "skipped"> {
  if (!delivery.channel_id || !delivery.channel_type || !delivery.channel_enabled) {
    await markDelivery(pool, delivery.id, "skipped", "notification channel is disabled or unavailable");
    return "skipped";
  }

  if (delivery.channel_type === "in_app") {
    await markDelivery(pool, delivery.id, "sent", null);
    return "sent";
  }

  if (delivery.channel_type === "logging") {
    options.writer.log(JSON.stringify({
      source: "juno-wholesale-ops",
      readOnly: true,
      channelId: delivery.channel_id,
      subject: delivery.subject,
      payload: delivery.payload,
    }));
    await markDelivery(pool, delivery.id, "sent", null);
    return "sent";
  }

  const webhookUrl = resolveWebhookUrl({
    config: delivery.channel_config,
    secretRef: delivery.secret_ref,
    env: options.env,
  });
  if (!webhookUrl) {
    await markDelivery(pool, delivery.id, "failed", "webhook URL is not configured");
    return "failed";
  }

  try {
    const response = await postWebhook({
      url: webhookUrl,
      delivery,
      fetchImpl: options.fetchImpl,
    });
    if (!response.ok) {
      await markDelivery(pool, delivery.id, "failed", `webhook responded with status ${response.status}`);
      return "failed";
    }
    await markDelivery(pool, delivery.id, "sent", null);
    return "sent";
  } catch (error) {
    await markDelivery(pool, delivery.id, "failed", safeWebhookError(error));
    return "failed";
  }
}

async function loadQueuedDeliveries(pool: Pool, limit: number): Promise<DispatchDeliveryRow[]> {
  const result = await pool.query<DispatchDeliveryRow>(
    `
      SELECT
        notification_delivery.id::text,
        notification_delivery.channel_id::text,
        notification_channel.name AS channel_name,
        notification_channel.type AS channel_type,
        notification_channel.enabled AS channel_enabled,
        COALESCE(notification_channel.config, '{}'::jsonb) AS channel_config,
        notification_channel.secret_ref,
        notification_delivery.subject,
        notification_delivery.body,
        notification_delivery.payload
      FROM notification_delivery
      LEFT JOIN notification_channel ON notification_channel.id = notification_delivery.channel_id
      WHERE notification_delivery.status = 'queued'
      ORDER BY notification_delivery.queued_at, notification_delivery.id
      LIMIT $1
    `,
    [limit],
  );
  return result.rows;
}

async function markDelivery(
  pool: Pool,
  id: string,
  status: NotificationDeliveryStatus,
  lastError: string | null,
): Promise<void> {
  await pool.query(
    `
      UPDATE notification_delivery
      SET status = $2,
          attempts = attempts + 1,
          last_error = $3,
          sent_at = CASE WHEN $2 = 'sent' THEN now() ELSE sent_at END,
          updated_at = now()
      WHERE id = $1
    `,
    [id, status, lastError],
  );
}

async function postWebhook(options: {
  url: string;
  delivery: DispatchDeliveryRow;
  fetchImpl: FetchLike;
}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(controller.abort.bind(controller), 10_000);
  try {
    return await options.fetchImpl(options.url, {
      method: "POST",
      headers: buildWebhookHeaders(options.delivery.channel_config),
      body: JSON.stringify({
        source: "juno-wholesale-ops",
        readOnly: true,
        subject: options.delivery.subject,
        body: options.delivery.body,
        ...options.delivery.payload,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function resolveWebhookUrl(options: {
  config: NotificationConfig;
  secretRef: string | null;
  env: Record<string, string | undefined>;
}): string | null {
  if (options.secretRef) {
    const fromEnv = options.env[options.secretRef]?.trim();
    if (fromEnv) {
      return fromEnv;
    }
  }
  const configUrl = options.config.url;
  return typeof configUrl === "string" && configUrl.trim() ? configUrl.trim() : null;
}

function buildWebhookHeaders(config: NotificationConfig): HeadersInit {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (isRecord(config.headers)) {
    for (const [key, value] of Object.entries(config.headers)) {
      if (typeof value === "string") {
        headers[key] = value;
      }
    }
  }
  return headers;
}

function safeWebhookError(error: unknown): string {
  if (error instanceof Error && error.name === "AbortError") {
    return "webhook request timed out";
  }
  return "webhook dispatch failed";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
