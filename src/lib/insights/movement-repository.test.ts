import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { recordCatalogAttachment, type MessageRecord } from "@/lib/ingest/repository";
import type { ParsedCatalog } from "@/lib/ingest/juno-parser";
import {
  resetApplicationTables,
  startMigratedPostgresTestDatabase,
  testMailboxSourceId,
  type StartedPostgresTestDatabase,
} from "@/test/postgres";
import { processInsightsForSnapshot } from "./repository";
import {
  getMovementSignals,
  processMovementSignalsForRecentObservations,
  resolveLiveObservationIdentityIdClient,
} from "./movement-repository";

describe("movement insights repository", () => {
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

  it("generates idempotent movement signals from adjacent live observations", async () => {
    const databaseUrl = database.container.getConnectionUri();
    const snapshot = await recordCatalogAttachment({
      databaseUrl,
      supplierCode: "juno",
      message: message("message-movement"),
      attachment: {
        filename: "Juno Wholesale New Releases In Stock 17 June 2026.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        byteSize: 100,
        sha256: "attachment-movement",
        storageUri: "/tmp/movement.xlsx",
        catalog: catalog("content-hash-movement"),
      },
    });
    await processInsightsForSnapshot({ databaseUrl, snapshotId: snapshot.snapshotId });
    const raw = await database.pool.query<{ id: string; identity_id: string }>(
      "SELECT id::text, identity_id::text FROM catalog_item_raw LIMIT 1",
    );
    await insertObservation({
      identityId: raw.rows[0].identity_id,
      catalogItemRawId: raw.rows[0].id,
      status: "out_of_stock",
      stockQuantity: null,
      price: null,
      observedAt: recentObservationIso(40),
    });
    await insertObservation({
      identityId: raw.rows[0].identity_id,
      catalogItemRawId: raw.rows[0].id,
      status: "in_stock",
      stockQuantity: 8,
      price: 10,
      observedAt: recentObservationIso(32),
    });
    await insertObservation({
      identityId: raw.rows[0].identity_id,
      catalogItemRawId: raw.rows[0].id,
      status: "in_stock",
      stockQuantity: 2,
      price: 11,
      observedAt: recentObservationIso(20),
    });

    const first = await processMovementSignalsForRecentObservations({
      databaseUrl,
      lookbackHours: 72,
      lowStockThreshold: 3,
    });
    const second = await processMovementSignalsForRecentObservations({
      databaseUrl,
      lookbackHours: 72,
      lowStockThreshold: 3,
    });
    const defaultOptionsRun = await processMovementSignalsForRecentObservations({ databaseUrl });
    const signals = await getMovementSignals(databaseUrl, 20);

    expect(first).toEqual({
      observationsScanned: 3,
      signalsInserted: 6,
      restocks: 1,
      stockDrops: 1,
      lowLiveStock: 1,
      statusChanges: 1,
      priceChanges: 1,
      fastMoverCandidates: 1,
    });
    expect(second).toEqual({
      observationsScanned: 3,
      signalsInserted: 0,
      restocks: 0,
      stockDrops: 0,
      lowLiveStock: 0,
      statusChanges: 0,
      priceChanges: 0,
      fastMoverCandidates: 0,
    });
    expect(defaultOptionsRun).toMatchObject({
      observationsScanned: 3,
      signalsInserted: 0,
    });
    expect(signals.map((signal) => signal.type).sort()).toEqual([
      "fast_mover_candidate",
      "observed_live_low_stock",
      "observed_price_change",
      "observed_restock",
      "observed_status_change",
      "observed_stock_drop",
    ]);
    expect(signals.find((signal) => signal.type === "fast_mover_candidate")).toMatchObject({
      title: "Fast mover candidate: Lara Voss - Signal Path",
      item: {
        identityId: raw.rows[0].identity_id,
        junoId: "1148569-01",
      },
    });
    await expect(
      resolveLiveObservationIdentityIdClient(database.pool as never, {
        catalogItemRawId: null,
        junoId: null,
      }),
    ).resolves.toBeNull();
    await expect(
      resolveLiveObservationIdentityIdClient(database.pool as never, {
        catalogItemRawId: "00000000-0000-0000-0000-000000000000",
        junoId: null,
      }),
    ).resolves.toBeNull();
    await expect(
      processMovementSignalsForRecentObservations({ databaseUrl, lookbackHours: Number.NaN }),
    ).rejects.toThrow();
  });

  async function insertObservation(input: {
    identityId: string;
    catalogItemRawId: string;
    status: string;
    stockQuantity: number | null;
    price: number | null;
    observedAt: string;
  }) {
    await database.pool.query(
      `
        INSERT INTO juno_live_observation (
          juno_id,
          catalog_item_raw_id,
          identity_id,
          status,
          stock_quantity,
          display_stock,
          wholesale_price_gbp,
          product_url,
          final_url,
          parser_version,
          observed_at,
          metadata
        )
        VALUES ('1148569-01',$1,$2,$3,$4,$5,$6,'https://www.juno.co.uk/products/1148569-01/','https://www.juno.co.uk/products/1148569-01/','v1',$7,'{}')
      `,
      [
        input.catalogItemRawId,
        input.identityId,
        input.status,
        input.stockQuantity,
        input.stockQuantity === null ? "N/A" : `${input.stockQuantity} in stock`,
        input.price,
        input.observedAt,
      ],
    );
  }
});

function recentObservationIso(hoursAgo: number): string {
  return new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
}

function message(gmailMessageId: string): MessageRecord {
  return {
    provider: "gmail",
    mailboxAddress: "operator@example.com",
    mailboxSourceId: testMailboxSourceId,
    providerMessageId: gmailMessageId,
    providerThreadId: null,
    rfc822MessageId: `<${gmailMessageId}@example.com>`,
    subject: "Daily Juno",
    fromAddress: "juno@example.com",
    toAddresses: ["catalog@example.com"],
    deliveredTo: ["operator@example.com"],
    receivedAt: "2026-06-17T00:00:00.000Z",
    payload: { id: gmailMessageId, payload: { headers: [] } },
  };
}

function catalog(contentHash: string): ParsedCatalog {
  return {
    kind: "in_stock",
    catalogDate: "2026-06-17",
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
