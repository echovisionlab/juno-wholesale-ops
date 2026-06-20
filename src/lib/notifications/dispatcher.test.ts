import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetApplicationTables,
  startMigratedPostgresTestDatabase,
  type StartedPostgresTestDatabase,
} from "@/test/postgres";
import { createNotificationChannel, listNotificationChannels, listNotificationDeliveries } from "./repository";
import { dispatchQueuedNotifications } from "./dispatcher";

describe("notification dispatcher", () => {
  let database: StartedPostgresTestDatabase;

  beforeAll(async () => {
    database = await startMigratedPostgresTestDatabase();
  });

  beforeEach(async () => {
    await resetApplicationTables(database.pool);
  });

  afterAll(async () => {
    await database.stop();
  });

  it("keeps dry-run non-mutating and dispatches in-app alerts without external requests", async () => {
    const databaseUrl = database.container.getConnectionUri();
    const channel = (await listNotificationChannels(databaseUrl))[0];
    await insertDelivery(channel.id, "in-app");
    const fetchImpl = vi.fn();

    await expect(dispatchQueuedNotifications({
      databaseUrl,
      mode: "dry-run",
      limit: 1,
      fetchImpl,
    })).resolves.toEqual({ sent: 0, failed: 0, skipped: 1, dryRun: true });
    expect(fetchImpl).not.toHaveBeenCalled();
    await expect(deliveryStatuses(databaseUrl)).resolves.toEqual(["queued"]);

    await expect(dispatchQueuedNotifications({
      databaseUrl,
      mode: "send",
      fetchImpl,
    })).resolves.toEqual({ sent: 1, failed: 0, skipped: 0, dryRun: false });
    expect(fetchImpl).not.toHaveBeenCalled();
    await expect(deliveryStatuses(databaseUrl)).resolves.toEqual(["sent"]);

    await insertDelivery(channel.id, "in-app-default-options");
    await expect(dispatchQueuedNotifications({
      databaseUrl,
      mode: "send",
    })).resolves.toEqual({ sent: 1, failed: 0, skipped: 0, dryRun: false });
  });

  it("dispatches logging and webhook channels while storing failures safely", async () => {
    const databaseUrl = database.container.getConnectionUri();
    const logging = await createNotificationChannel(databaseUrl, {
      name: "Audit log",
      type: "logging",
    });
    const webhook = await createNotificationChannel(databaseUrl, {
      name: "Ops webhook",
      type: "webhook",
      config: {
        url: "https://hooks.example.test/secret",
        format: "slack",
        headers: { Authorization: "Bearer secret", "X-Retry": 1 },
      },
    });
    const envWebhook = await createNotificationChannel(databaseUrl, {
      name: "Env webhook",
      type: "webhook",
      secretRef: "TEST_WEBHOOK_URL",
      config: { format: "discord" },
    });
    const envFallbackWebhook = await createNotificationChannel(databaseUrl, {
      name: "Env fallback webhook",
      type: "webhook",
      secretRef: "MISSING_WEBHOOK_URL",
      config: { url: "https://hooks.example.test/fallback-secret", format: "telegram", chatId: "-1001" },
    });
    const failingWebhook = await createNotificationChannel(databaseUrl, {
      name: "Failing webhook",
      type: "webhook",
      config: { url: "https://hooks.example.test/failing-secret" },
    });
    const throwingWebhook = await createNotificationChannel(databaseUrl, {
      name: "Throwing webhook",
      type: "webhook",
      config: { url: "https://hooks.example.test/throwing-secret" },
    });
    const timeoutWebhook = await createNotificationChannel(databaseUrl, {
      name: "Timeout webhook",
      type: "webhook",
      config: { url: "https://hooks.example.test/timeout-secret" },
    });
    const missingWebhook = await createNotificationChannel(databaseUrl, {
      name: "Missing webhook",
      type: "webhook",
    });
    const disabled = await createNotificationChannel(databaseUrl, {
      name: "Disabled webhook",
      type: "webhook",
      enabled: false,
      config: { url: "https://hooks.example.test/disabled-secret" },
    });
    await insertDelivery(logging.id, "logging");
    await insertDelivery(webhook.id, "webhook-success");
    await insertDelivery(envWebhook.id, "webhook-env");
    await insertDelivery(envFallbackWebhook.id, "webhook-env-fallback");
    await insertDelivery(failingWebhook.id, "webhook-failure");
    await insertDelivery(throwingWebhook.id, "webhook-throw");
    await insertDelivery(timeoutWebhook.id, "webhook-timeout");
    await insertDelivery(missingWebhook.id, "webhook-missing");
    await insertDelivery(disabled.id, "webhook-disabled");
    const writer = { log: vi.fn() };
    const abortError = Object.assign(new Error("aborted"), { name: "AbortError" });
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response("ok", { status: 200 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }))
      .mockResolvedValueOnce(new Response("nope", { status: 500 }))
      .mockRejectedValueOnce(new Error("network down"))
      .mockRejectedValueOnce(abortError);

    await expect(dispatchQueuedNotifications({
      databaseUrl,
      mode: "send",
      fetchImpl,
      writer,
      env: { TEST_WEBHOOK_URL: "https://hooks.example.test/env-secret" },
    })).resolves.toEqual({ sent: 4, failed: 4, skipped: 1, dryRun: false });

    expect(writer.log).toHaveBeenCalledWith(expect.stringContaining("Read-only alert logging"));
    expect(writer.log.mock.calls.join("\n")).not.toContain("secret");
    expect(fetchImpl).toHaveBeenCalledTimes(6);
    expect(fetchImpl.mock.calls[0][0]).toBe("https://hooks.example.test/secret");
    expect(fetchImpl.mock.calls[1][0]).toBe("https://hooks.example.test/env-secret");
    expect(fetchImpl.mock.calls[2][0]).toBe("https://hooks.example.test/fallback-secret");
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({
        Authorization: "Bearer secret",
        "content-type": "application/json",
      }),
    });
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).toMatchObject({
      text: "Read-only alert webhook-success",
      blocks: [expect.objectContaining({ type: "section" })],
    });
    expect(JSON.parse(String(fetchImpl.mock.calls[1][1]?.body))).toMatchObject({
      content: "Read-only alert webhook-env",
      embeds: [expect.objectContaining({ title: "Read-only alert webhook-env" })],
      allowed_mentions: { parse: [] },
    });
    expect(JSON.parse(String(fetchImpl.mock.calls[2][1]?.body))).toMatchObject({
      chat_id: "-1001",
      text: expect.stringContaining("Read-only alert webhook-env-fallback"),
    });

    const deliveries = await listNotificationDeliveries(databaseUrl, 20);
    expect(deliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ deliveryKey: "test:logging", status: "sent", attempts: 1 }),
        expect.objectContaining({ deliveryKey: "test:webhook-success", status: "sent", attempts: 1 }),
        expect.objectContaining({ deliveryKey: "test:webhook-env", status: "sent", attempts: 1 }),
        expect.objectContaining({ deliveryKey: "test:webhook-env-fallback", status: "sent", attempts: 1 }),
        expect.objectContaining({
          deliveryKey: "test:webhook-failure",
          status: "failed",
          lastError: "webhook responded with status 500",
        }),
        expect.objectContaining({
          deliveryKey: "test:webhook-throw",
          status: "failed",
          lastError: "webhook dispatch failed",
        }),
        expect.objectContaining({
          deliveryKey: "test:webhook-timeout",
          status: "failed",
          lastError: "webhook request timed out",
        }),
        expect.objectContaining({
          deliveryKey: "test:webhook-missing",
          status: "failed",
          lastError: "webhook URL is not configured",
        }),
        expect.objectContaining({
          deliveryKey: "test:webhook-disabled",
          status: "skipped",
          lastError: "notification channel is disabled or unavailable",
        }),
      ]),
    );
  });

  async function insertDelivery(channelId: string, key: string) {
    await database.pool.query(
      `
        INSERT INTO notification_delivery (
          channel_id,
          status,
          delivery_key,
          subject,
          body,
          payload
        )
        VALUES ($1,'queued',$2,$3,$4,$5)
      `,
      [
        channelId,
        `test:${key}`,
        `Read-only alert ${key}`,
        "Read-only signal from Juno Wholesale Ops.",
        JSON.stringify({ source: "juno-wholesale-ops", readOnly: true }),
      ],
    );
  }
});

async function deliveryStatuses(databaseUrl: string): Promise<string[]> {
  return (await listNotificationDeliveries(databaseUrl, 10)).map((delivery) => delivery.status);
}
