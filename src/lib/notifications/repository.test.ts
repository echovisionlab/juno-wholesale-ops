import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { recordCatalogAttachment, type MessageRecord } from "@/lib/ingest/repository";
import type { ParsedCatalog } from "@/lib/ingest/juno-parser";
import { createWatchRule, processInsightsForSnapshot } from "@/lib/insights/repository";
import {
  resetApplicationTables,
  startMigratedPostgresTestDatabase,
  type StartedPostgresTestDatabase,
} from "@/test/postgres";
import {
  createNotificationChannel,
  createNotificationRule,
  deleteNotificationChannel,
  deleteNotificationRule,
  listNotificationChannels,
  listNotificationDeliveries,
  listNotificationRules,
  matchNotificationRulesForSignals,
  updateNotificationChannel,
  updateNotificationRule,
} from "./repository";

describe("notification repository", () => {
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

  it("manages channels and rules with masked webhook config", async () => {
    const databaseUrl = database.container.getConnectionUri();
    const defaultChannels = await listNotificationChannels(databaseUrl);
    const webhook = await createNotificationChannel(databaseUrl, {
      name: "Ops webhook",
      type: "webhook",
      config: {
        url: "https://hooks.example.test/secret",
        headers: { Authorization: "Bearer secret", "X-Plain": "visible" },
      },
      secretRef: "JUNO_OPS_WEBHOOK_URL",
    });
    const updatedWebhook = await updateNotificationChannel(databaseUrl, {
      id: webhook.id,
      enabled: false,
      type: "logging",
      config: {},
      secretRef: null,
    });
    const noOpChannelPatch = await updateNotificationChannel(databaseUrl, { id: webhook.id });
    const inApp = defaultChannels[0];
    const rule = await createNotificationRule(databaseUrl, {
      name: "Watch alerts",
      channelId: inApp.id,
      signalTypes: ["watch_hit"],
      severities: ["watch"],
      minScore: 1,
      includeDigest: true,
      cooldownMinutes: 30,
    });
    const updatedRule = await updateNotificationRule(databaseUrl, {
      id: rule.id,
      name: "Watch and digest alerts",
      signalTypes: [],
      severities: [],
      minScore: -5,
      includeWatchHits: false,
      cooldownMinutes: 0,
    });
    const noOpRulePatch = await updateNotificationRule(databaseUrl, { id: rule.id });
    const rules = await listNotificationRules(databaseUrl);

    expect(defaultChannels).toEqual([
      expect.objectContaining({
        name: "In-app notifications",
        type: "in_app",
        configSummary: "Dashboard-only read-only alerts",
      }),
    ]);
    expect(JSON.stringify(webhook.config)).not.toContain("hooks.example.test/secret");
    expect(JSON.stringify(webhook.config)).not.toContain("Bearer secret");
    expect(webhook).toMatchObject({
      config: expect.objectContaining({
        url: "[configured]",
        secretRef: "JUNO_OPS_WEBHOOK_URL",
      }),
      configSummary: "Webhook URL from JUNO_OPS_WEBHOOK_URL",
    });
    expect(updatedWebhook).toMatchObject({
      type: "logging",
      enabled: false,
      secretRef: null,
      configSummary: "Console JSON read-only alert log",
    });
    expect(noOpChannelPatch).toMatchObject({ id: webhook.id, name: "Ops webhook" });
    expect(updatedRule).toMatchObject({
      name: "Watch and digest alerts",
      signalTypes: [],
      severities: [],
      minScore: -5,
      includeWatchHits: false,
      cooldownMinutes: 0,
    });
    expect(noOpRulePatch).toMatchObject({ id: rule.id, name: "Watch and digest alerts" });
    expect(rules[0]).toMatchObject({ id: rule.id, channelName: "In-app notifications" });
    await expect(updateNotificationChannel(databaseUrl, { id: "00000000-0000-0000-0000-000000000000" })).resolves.toBeNull();
    await expect(updateNotificationRule(databaseUrl, { id: "00000000-0000-0000-0000-000000000000" })).resolves.toBeNull();
    await expect(deleteNotificationRule(databaseUrl, rule.id)).resolves.toBe(true);
    await expect(deleteNotificationRule(databaseUrl, rule.id)).resolves.toBe(false);
    await expect(deleteNotificationChannel(databaseUrl, webhook.id)).resolves.toBe(true);
    await expect(deleteNotificationChannel(databaseUrl, webhook.id)).resolves.toBe(false);
  });

  it("validates unsafe channel and rule input before writing", async () => {
    const databaseUrl = database.container.getConnectionUri();
    const channel = (await listNotificationChannels(databaseUrl))[0];

    await expect(createNotificationChannel(databaseUrl, { name: "", type: "in_app" })).rejects.toThrow(
      "Notification channel name is required",
    );
    await expect(createNotificationChannel(databaseUrl, { name: "Bad", type: "email" as never })).rejects.toThrow(
      "Notification channel type is invalid",
    );
    await expect(createNotificationChannel(databaseUrl, { name: "Bad", type: "webhook", config: [] })).rejects.toThrow(
      "Notification channel config must be an object",
    );
    await expect(updateNotificationChannel(databaseUrl, { id: "" })).rejects.toThrow(
      "Notification channel id is required",
    );
    await expect(createNotificationRule(databaseUrl, { name: "", channelId: channel.id })).rejects.toThrow(
      "Notification rule name is required",
    );
    await expect(createNotificationRule(databaseUrl, { name: "No channel", channelId: "" })).rejects.toThrow(
      "Notification rule channel id is required",
    );
    await expect(createNotificationRule(databaseUrl, {
      name: "Bad signal",
      channelId: channel.id,
      signalTypes: ["unknown" as never],
    })).rejects.toThrow("Notification rule signal type is invalid");
    await expect(createNotificationRule(databaseUrl, {
      name: "Bad severity",
      channelId: channel.id,
      severities: ["notice" as never],
    })).rejects.toThrow("Notification rule severity is invalid");
    await expect(createNotificationRule(databaseUrl, { name: "Bad score", channelId: channel.id, minScore: 101 })).rejects.toThrow(
      "Notification rule min score must be an integer between -100 and 100",
    );
    await expect(createNotificationRule(databaseUrl, { name: "Bad cooldown", channelId: channel.id, cooldownMinutes: -1 })).rejects.toThrow(
      "Notification rule cooldown must be a non-negative integer",
    );
    await expect(updateNotificationRule(databaseUrl, { id: "" })).rejects.toThrow("Notification rule id is required");
  });

  it("queues signal and digest deliveries idempotently with cooldown skips", async () => {
    const databaseUrl = database.container.getConnectionUri();
    const snapshot = await recordCatalogAttachment({
      databaseUrl,
      supplierCode: "juno",
      message: message("message-notification"),
      attachment: {
        filename: "Juno Wholesale New Releases In Stock 18 June 2026.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        byteSize: 100,
        sha256: "attachment-notification",
        storageUri: "/tmp/notification.xlsx",
        catalog: catalog("content-hash-notification"),
      },
    });
    await createWatchRule(databaseUrl, { type: "label", pattern: "Blue Note", weight: 15 });
    await processInsightsForSnapshot({ databaseUrl, snapshotId: snapshot.snapshotId });
    const channel = (await listNotificationChannels(databaseUrl))[0];
    await createNotificationRule(databaseUrl, {
      name: "Watch alerts",
      channelId: channel.id,
      signalTypes: ["watch_hit"],
      severities: ["watch"],
      minScore: 1,
      includeDigest: true,
      cooldownMinutes: 60,
    });

    const first = await matchNotificationRulesForSignals({
      databaseUrl,
      since: "2026-01-01T00:00:00.000Z",
      digestDate: "2026-06-18",
      limit: 20,
    });
    const second = await matchNotificationRulesForSignals({
      databaseUrl,
      since: "2026-01-01T00:00:00.000Z",
      digestDate: "2026-06-18",
      limit: 20,
    });
    const identity = await database.pool.query<{ identity_id: string }>(
      "SELECT identity_id::text FROM catalog_item_raw LIMIT 1",
    );
    await database.pool.query(
      `
        INSERT INTO signal_event (
          identity_id,
          catalog_item_raw_id,
          type,
          severity,
          score,
          title,
          detail,
          metadata,
          event_key
        )
        VALUES ($1,NULL,'watch_hit','watch',20,'Watch hit: second signal','Observed catalog row matched a watch rule.','{}','test:notification:second')
      `,
      [identity.rows[0].identity_id],
    );
    const cooldown = await matchNotificationRulesForSignals({
      databaseUrl,
      since: "2026-01-01T00:00:00.000Z",
      digestDate: "2026-06-18",
      limit: 20,
    });
    const deliveries = await listNotificationDeliveries(databaseUrl, 10);

    expect(first).toEqual({ queued: 2, skipped: 0 });
    expect(second).toEqual({ queued: 0, skipped: 2 });
    expect(cooldown).toEqual({ queued: 0, skipped: 3 });
    expect(deliveries.map((delivery) => delivery.deliveryKey).sort()).toEqual([
      `digest:${deliveries.find((delivery) => delivery.digestKey)?.ruleId}:${channel.id}:2026-06-18`,
      `signal:${deliveries.find((delivery) => delivery.signalType === "watch_hit")?.ruleId}:${channel.id}:${deliveries.find((delivery) => delivery.signalType === "watch_hit")?.signalEventId}`,
    ].sort());
    expect(deliveries.find((delivery) => delivery.signalType === "watch_hit")).toMatchObject({
      status: "queued",
      subject: "[Watch hit] Lara Voss - Signal Path",
      score: 15,
      severity: "watch",
    });
    expect(deliveries.find((delivery) => delivery.digestKey === "2026-06-18")).toMatchObject({
      subject: "[Operator digest] 2026-06-18",
      signalType: null,
      score: null,
    });
  });

  it("queues digest notifications with default refresh options", async () => {
    const databaseUrl = database.container.getConnectionUri();
    const channel = (await listNotificationChannels(databaseUrl))[0];
    await createNotificationRule(databaseUrl, {
      name: "Daily digest",
      channelId: channel.id,
      includeDigest: true,
      cooldownMinutes: 0,
    });

    const result = await matchNotificationRulesForSignals({ databaseUrl });
    const deliveries = await listNotificationDeliveries(databaseUrl, 5);

    expect(result).toEqual({ queued: 1, skipped: 0 });
    expect(deliveries[0]).toMatchObject({
      signalEventId: null,
      status: "queued",
      subject: expect.stringMatching(/^\[Operator digest\] \d{4}-\d{2}-\d{2}$/),
    });
  });

  it("skips duplicate signal delivery keys when cooldown is disabled", async () => {
    const databaseUrl = database.container.getConnectionUri();
    const snapshot = await recordCatalogAttachment({
      databaseUrl,
      supplierCode: "juno",
      message: message("message-notification-conflict"),
      attachment: {
        filename: "Juno Wholesale New Releases In Stock 18 June 2026.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        byteSize: 100,
        sha256: "attachment-notification-conflict",
        storageUri: "/tmp/notification-conflict.xlsx",
        catalog: catalog("content-hash-notification-conflict"),
      },
    });
    await createWatchRule(databaseUrl, { type: "label", pattern: "Blue Note", weight: 15 });
    await processInsightsForSnapshot({ databaseUrl, snapshotId: snapshot.snapshotId });
    const channel = (await listNotificationChannels(databaseUrl))[0];
    await createNotificationRule(databaseUrl, {
      name: "No cooldown signal",
      channelId: channel.id,
      signalTypes: ["watch_hit"],
      severities: ["watch"],
      cooldownMinutes: 0,
    });

    await expect(matchNotificationRulesForSignals({
      databaseUrl,
      since: "2026-01-01T00:00:00.000Z",
      digestDate: "2026-06-18",
    })).resolves.toEqual({ queued: 1, skipped: 0 });
    await expect(matchNotificationRulesForSignals({
      databaseUrl,
      since: "2026-01-01T00:00:00.000Z",
      digestDate: "2026-06-18",
    })).resolves.toEqual({ queued: 0, skipped: 1 });
  });

  it("rolls back queue transactions when delivery inserts fail", async () => {
    const databaseUrl = database.container.getConnectionUri();
    const channel = (await listNotificationChannels(databaseUrl))[0];
    await createNotificationRule(databaseUrl, {
      name: "Digest failure",
      channelId: channel.id,
      includeDigest: true,
    });

    await database.pool.query(
      "ALTER TABLE notification_delivery ADD CONSTRAINT notification_delivery_test_fail CHECK (false) NOT VALID",
    );
    try {
      await expect(matchNotificationRulesForSignals({
        databaseUrl,
        since: "2999-01-01T00:00:00.000Z",
        digestDate: "2026-06-18",
      })).rejects.toThrow();
    } finally {
      await database.pool.query("ALTER TABLE notification_delivery DROP CONSTRAINT notification_delivery_test_fail");
    }

    const snapshot = await recordCatalogAttachment({
      databaseUrl,
      supplierCode: "juno",
      message: message("message-notification-failure"),
      attachment: {
        filename: "Juno Wholesale New Releases In Stock 18 June 2026.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        byteSize: 100,
        sha256: "attachment-notification-failure",
        storageUri: "/tmp/notification-failure.xlsx",
        catalog: catalog("content-hash-notification-failure"),
      },
    });
    await createWatchRule(databaseUrl, { type: "label", pattern: "Blue Note", weight: 15 });
    await processInsightsForSnapshot({ databaseUrl, snapshotId: snapshot.snapshotId });
    await createNotificationRule(databaseUrl, {
      name: "Signal failure",
      channelId: channel.id,
      signalTypes: ["watch_hit"],
      severities: ["watch"],
      includeDigest: false,
    });

    await database.pool.query(
      "ALTER TABLE notification_delivery ADD CONSTRAINT notification_delivery_test_fail CHECK (false) NOT VALID",
    );
    try {
      await expect(matchNotificationRulesForSignals({
        databaseUrl,
        since: "2026-01-01T00:00:00.000Z",
        digestDate: "2026-06-18",
      })).rejects.toThrow();
    } finally {
      await database.pool.query("ALTER TABLE notification_delivery DROP CONSTRAINT notification_delivery_test_fail");
    }
  });
});

function message(gmailMessageId: string): MessageRecord {
  return {
    userEmail: "operator@example.com",
    gmailMessageId,
    gmailThreadId: null,
    rfc822MessageId: `<${gmailMessageId}@example.com>`,
    subject: "Daily Juno",
    fromAddress: "juno@example.com",
    toAddresses: ["catalog@example.com"],
    deliveredTo: ["operator@example.com"],
    receivedAt: "2026-06-18T00:00:00.000Z",
    payload: { id: gmailMessageId, payload: { headers: [] } },
  };
}

function catalog(contentHash: string): ParsedCatalog {
  return {
    kind: "in_stock",
    catalogDate: "2026-06-18",
    sheetName: "Sheet1",
    contentHash,
    rowCount: 1,
    items: [
      {
        rowNumber: 2,
        junoId: "1148569-01",
        artist: "Lara Voss",
        title: "Signal Path",
        label: "Blue Note",
        catNo: "BN-101",
        barcode: "1234567890123",
        medium: "LP",
        description: "Standard issue",
        genre: "Jazz",
        dealerExVatText: "GBP 10.00",
        dealerPriceGbp: 10,
        releaseDate: "2026-06-21",
        stock: 2,
        maxOrder: null,
        raw: { "Juno ID": "1148569-01" },
      },
    ],
  };
}
