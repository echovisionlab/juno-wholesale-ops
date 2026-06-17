import { Pool, type PoolClient } from "pg";
import {
  type AttachmentRecord,
  type MessageRecord,
  recordCatalogAttachment,
  recordGmailIngestFinished,
  recordGmailIngestStarted,
} from "@/lib/ingest/repository";
import { processMovementSignalsForRecentObservations } from "@/lib/insights/movement-repository";
import { createWatchRule, processInsightsForSnapshot } from "@/lib/insights/repository";
import { refreshCatalogTrendSignals } from "@/lib/insights/trend-repository";
import { createNotificationChannel, createNotificationRule, matchNotificationRulesForSignals } from "@/lib/notifications/repository";
import {
  assertSyntheticDemoCatalogFixtures,
  loadDemoCatalogFixtures,
  type DemoCatalogFixture,
} from "./fixtures";

const demoSupplierCode = "demo";
const demoMessageUser = "demo.local";
export const demoNotificationChannelName = "Demo in-app notifications";
const demoNotificationRuleName = "Demo read-only signal queue";
export const demoResetConfirmFlag = "--confirm-demo-reset";

export type DemoSeedResult = {
  snapshots: number;
  insertedItems: number;
  duplicateSnapshots: number;
  watchRules: number;
  insightSignals: number;
  movementSignals: number;
  trendSignals: number;
  notificationDeliveriesQueued: number;
  notificationDeliveriesSkipped: number;
};

export type DemoResetResult = {
  notificationDeliveriesDeleted: number;
  notificationRulesDeleted: number;
  notificationChannelsDeleted: number;
  liveObservationsDeleted: number;
  signalEventsDeleted: number;
  watchRulesDeleted: number;
  catalogSnapshotsDeleted: number;
  mailMessagesDeleted: number;
  suppliersDeleted: number;
};

const demoWatchRules = [
  { type: "label", pattern: "Sample Signal Records", weight: 15 },
  { type: "genre", pattern: "Deep House", weight: 8 },
  { type: "keyword", pattern: "observed motion", weight: 6 },
  { type: "exclude_keyword", pattern: "archive copy", weight: -20 },
] as const;

const demoLiveObservationRows = [
  {
    id: "10000000-0000-4000-8000-000000002001",
    junoId: "demo-2001",
    observedOffsetHours: 3,
    status: "in_stock",
    stockQuantity: 8,
    displayStock: "8",
    wholesalePriceGbp: "8.50",
  },
  {
    id: "10000000-0000-4000-8000-000000002002",
    junoId: "demo-2001",
    observedOffsetHours: 1,
    status: "in_stock",
    stockQuantity: 2,
    displayStock: "2",
    wholesalePriceGbp: "9.00",
  },
  {
    id: "10000000-0000-4000-8000-000000002003",
    junoId: "demo-2002",
    observedOffsetHours: 4,
    status: "out_of_stock",
    stockQuantity: 0,
    displayStock: "0",
    wholesalePriceGbp: "10.00",
  },
  {
    id: "10000000-0000-4000-8000-000000002004",
    junoId: "demo-2002",
    observedOffsetHours: 2,
    status: "in_stock",
    stockQuantity: 5,
    displayStock: "5",
    wholesalePriceGbp: "10.00",
  },
] as const;

export async function seedDemoData(options: {
  databaseUrl: string;
  rootDir?: string;
}): Promise<DemoSeedResult> {
  const fixtures = await loadDemoCatalogFixtures(options.rootDir);
  assertSyntheticDemoCatalogFixtures(fixtures);

  await ensureDemoWatchRules(options.databaseUrl);
  await recordGmailIngestStarted({
    databaseUrl: options.databaseUrl,
    query: "synthetic-demo-fixtures",
    windowFrom: null,
    windowTo: new Date().toISOString(),
  });

  let insertedItems = 0;
  let duplicateSnapshots = 0;
  let insightSignals = 0;
  let lastSnapshotId: string | null = null;
  let lastCatalogDate: string | null = null;
  let lastContentHash: string | null = null;

  for (const fixture of fixtures) {
    const result = await recordDemoFixture(options.databaseUrl, fixture);
    insertedItems += result.insertedItems;
    duplicateSnapshots += result.duplicateSnapshot ? 1 : 0;
    lastSnapshotId = result.snapshotId;
    lastCatalogDate = fixture.catalog.catalogDate;
    lastContentHash = fixture.catalog.contentHash;

    await setDemoSnapshotWindow(options.databaseUrl, result.snapshotId, fixture.filename.includes("preorders") ? "previous" : "current");
    const insights = await processInsightsForSnapshot({ databaseUrl: options.databaseUrl, snapshotId: result.snapshotId });
    insightSignals += insights.signals;
  }

  await seedDemoLiveObservations(options.databaseUrl);
  const movement = await processMovementSignalsForRecentObservations({ databaseUrl: options.databaseUrl });
  const trends = await refreshCatalogTrendSignals({ databaseUrl: options.databaseUrl });
  const notificationQueue = await seedDemoNotifications(options.databaseUrl);

  await recordGmailIngestFinished({
    databaseUrl: options.databaseUrl,
    status: "succeeded",
    error: null,
    messageCount: fixtures.length,
    attachmentCount: fixtures.length,
    lastSuccessfulMessageReceivedAt: new Date().toISOString(),
    lastIngestedSnapshotId: lastSnapshotId,
    lastIngestedCatalogDate: lastCatalogDate,
    lastIngestedContentHash: lastContentHash,
  });

  return {
    snapshots: fixtures.length,
    insertedItems,
    duplicateSnapshots,
    watchRules: demoWatchRules.length,
    insightSignals,
    movementSignals: movement.signalsInserted,
    trendSignals: trends.signalsInserted,
    notificationDeliveriesQueued: notificationQueue.queued,
    notificationDeliveriesSkipped: notificationQueue.skipped,
  };
}

export function assertDemoResetAllowed(options: {
  confirm: boolean;
  nodeEnv?: string;
}): void {
  if (!options.confirm) {
    throw new Error(`Demo reset requires ${demoResetConfirmFlag}`);
  }
  if (options.nodeEnv === "production") {
    throw new Error("Demo reset is refused when NODE_ENV=production");
  }
}

export async function resetDemoData(options: {
  databaseUrl: string;
  confirm: boolean;
  nodeEnv?: string;
}): Promise<DemoResetResult> {
  assertDemoResetAllowed({ confirm: options.confirm, nodeEnv: options.nodeEnv ?? process.env.NODE_ENV });
  const pool = new Pool({ connectionString: options.databaseUrl, max: 4 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await deleteDemoRows(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function ensureDemoWatchRules(databaseUrl: string): Promise<void> {
  for (const rule of demoWatchRules) {
    await createWatchRule(databaseUrl, rule);
  }
}

async function recordDemoFixture(databaseUrl: string, fixture: DemoCatalogFixture) {
  return recordCatalogAttachment({
    databaseUrl,
    supplierCode: demoSupplierCode,
    message: demoMessage(fixture),
    attachment: demoAttachment(fixture),
  });
}

function demoMessage(fixture: DemoCatalogFixture): MessageRecord {
  const messageId = `demo-${fixture.filename.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
  return {
    userEmail: demoMessageUser,
    gmailMessageId: messageId,
    gmailThreadId: `thread-${messageId}`,
    rfc822MessageId: `<${messageId}>`,
    subject: `Synthetic demo catalog ${fixture.catalog.kind}`,
    fromAddress: "synthetic-demo-source",
    toAddresses: [],
    deliveredTo: [],
    receivedAt: "2026-06-18T00:00:00.000Z",
    payload: {
      id: messageId,
      threadId: `thread-${messageId}`,
      internalDate: String(Date.UTC(2026, 5, 18)),
      payload: {
        mimeType: "multipart/mixed",
        headers: [
          { name: "X-Demo-Data", value: "synthetic" },
          { name: "Subject", value: `Synthetic demo catalog ${fixture.catalog.kind}` },
        ],
      },
    },
  };
}

function demoAttachment(fixture: DemoCatalogFixture): AttachmentRecord {
  return {
    filename: fixture.filename,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    byteSize: fixture.bytes.byteLength,
    sha256: fixture.sha256,
    storageUri: `demo://fixtures/catalog/${fixture.filename}`,
    catalog: fixture.catalog,
  };
}

async function setDemoSnapshotWindow(databaseUrl: string, snapshotId: string, window: "current" | "previous"): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await pool.query(
      `
        UPDATE catalog_snapshot
        SET created_at = CASE
          WHEN $2 = 'previous' THEN now() - interval '10 days'
          ELSE now()
        END
        WHERE id = $1
      `,
      [snapshotId, window],
    );
  } finally {
    await pool.end();
  }
}

export async function seedDemoLiveObservations(databaseUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const row of demoLiveObservationRows) {
      const item = await client.query<{ id: string; identity_id: string }>(
        `
          SELECT id::text, identity_id::text
          FROM catalog_item_raw
          WHERE juno_id = $1
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [row.junoId],
      );
      if (!item.rows[0]?.identity_id) {
        continue;
      }
      await client.query(
        `
          INSERT INTO juno_live_observation (
            id,
            juno_id,
            catalog_item_raw_id,
            status,
            stock_quantity,
            stock_text,
            display_stock,
            wholesale_price_gbp,
            product_url,
            final_url,
            parser_version,
            observed_at,
            duration_ms,
            error,
            metadata,
            identity_id
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now() - ($12::text || ' hours')::interval,$13,NULL,$14,$15)
          ON CONFLICT (id) DO UPDATE SET
            status = EXCLUDED.status,
            stock_quantity = EXCLUDED.stock_quantity,
            stock_text = EXCLUDED.stock_text,
            display_stock = EXCLUDED.display_stock,
            wholesale_price_gbp = EXCLUDED.wholesale_price_gbp,
            observed_at = EXCLUDED.observed_at,
            metadata = EXCLUDED.metadata,
            identity_id = EXCLUDED.identity_id
        `,
        [
          row.id,
          row.junoId,
          item.rows[0].id,
          row.status,
          row.stockQuantity,
          row.displayStock,
          row.displayStock,
          row.wholesalePriceGbp,
          `demo-product://${row.junoId}`,
          `demo-product://${row.junoId}`,
          "demo-seed",
          row.observedOffsetHours,
          0,
          JSON.stringify({ demo: true, demoSeed: "open-source-release" }),
          item.rows[0].identity_id,
        ],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function seedDemoNotifications(databaseUrl: string) {
  const channel = await createNotificationChannel(databaseUrl, {
    name: demoNotificationChannelName,
    type: "in_app",
    enabled: true,
    config: {},
    secretRef: null,
  });
  await createNotificationRule(databaseUrl, {
    name: demoNotificationRuleName,
    channelId: channel.id,
    signalTypes: [],
    severities: ["watch", "warning"],
    minScore: 1,
    includeWatchHits: true,
    includeDigest: true,
    cooldownMinutes: 0,
  });
  return matchNotificationRulesForSignals({
    databaseUrl,
    since: "1970-01-01T00:00:00.000Z",
    digestDate: new Date().toISOString().slice(0, 10),
    limit: 1000,
  });
}

async function deleteDemoRows(client: PoolClient): Promise<DemoResetResult> {
  const notificationDeliveriesDeleted = await deleteCount(client, `
    DELETE FROM notification_delivery
    WHERE rule_id IN (SELECT id FROM notification_rule WHERE name = $1)
       OR channel_id IN (SELECT id FROM notification_channel WHERE name = $2)
       OR signal_event_id IN (
          SELECT signal_event.id
          FROM signal_event
          LEFT JOIN catalog_item_raw ON catalog_item_raw.id = signal_event.catalog_item_raw_id
          LEFT JOIN catalog_snapshot ON catalog_snapshot.id = catalog_item_raw.snapshot_id
          LEFT JOIN supplier ON supplier.id = catalog_snapshot.supplier_id
          WHERE supplier.code = $3
       )
  `, [demoNotificationRuleName, demoNotificationChannelName, demoSupplierCode]);
  const notificationRulesDeleted = await deleteCount(client, "DELETE FROM notification_rule WHERE name = $1", [
    demoNotificationRuleName,
  ]);
  const notificationChannelsDeleted = await deleteCount(client, "DELETE FROM notification_channel WHERE name = $1", [
    demoNotificationChannelName,
  ]);
  const liveObservationsDeleted = await deleteCount(client, `
    DELETE FROM juno_live_observation
    WHERE metadata->>'demoSeed' = 'open-source-release'
       OR catalog_item_raw_id IN (
          SELECT catalog_item_raw.id
          FROM catalog_item_raw
          JOIN catalog_snapshot ON catalog_snapshot.id = catalog_item_raw.snapshot_id
          JOIN supplier ON supplier.id = catalog_snapshot.supplier_id
          WHERE supplier.code = $1
       )
  `, [demoSupplierCode]);
  const signalEventsDeleted = await deleteCount(client, `
    DELETE FROM signal_event
    WHERE catalog_item_raw_id IN (
        SELECT catalog_item_raw.id
        FROM catalog_item_raw
        JOIN catalog_snapshot ON catalog_snapshot.id = catalog_item_raw.snapshot_id
        JOIN supplier ON supplier.id = catalog_snapshot.supplier_id
        WHERE supplier.code = $1
      )
      OR identity_id IN (
        SELECT catalog_item_identity.id
        FROM catalog_item_identity
        JOIN supplier ON supplier.id = catalog_item_identity.supplier_id
        WHERE supplier.code = $1
      )
      OR (
        type = 'trend_spike'
        AND metadata->>'key' IN ('deep house', 'sample signal records')
      )
  `, [demoSupplierCode]);
  const watchRulesDeleted = await deleteCount(
    client,
    "DELETE FROM watch_rule WHERE pattern = ANY($1::text[])",
    [demoWatchRules.map((rule) => rule.pattern)],
  );
  const catalogSnapshotsDeleted = await deleteCount(client, `
    DELETE FROM catalog_snapshot
    WHERE supplier_id IN (SELECT id FROM supplier WHERE code = $1)
  `, [demoSupplierCode]);
  const mailMessagesDeleted = await deleteCount(client, "DELETE FROM mail_message WHERE gmail_user_email = $1", [
    demoMessageUser,
  ]);
  const suppliersDeleted = await deleteCount(client, "DELETE FROM supplier WHERE code = $1", [demoSupplierCode]);

  return {
    notificationDeliveriesDeleted,
    notificationRulesDeleted,
    notificationChannelsDeleted,
    liveObservationsDeleted,
    signalEventsDeleted,
    watchRulesDeleted,
    catalogSnapshotsDeleted,
    mailMessagesDeleted,
    suppliersDeleted,
  };
}

async function deleteCount(client: PoolClient, sql: string, params: unknown[]): Promise<number> {
  const result = await client.query(sql, params);
  return Number(result.rowCount);
}
