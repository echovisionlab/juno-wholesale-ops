import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { recordCatalogAttachment, type MessageRecord } from "@/lib/ingest/repository";
import type { ParsedCatalog } from "@/lib/ingest/juno-parser";
import {
  resetApplicationTables,
  startMigratedPostgresTestDatabase,
  testMailboxSourceId,
  type StartedPostgresTestDatabase,
} from "@/test/postgres";
import { createWatchRule, processInsightsForSnapshot } from "./repository";
import { getCatalogTrends, getInsightDigest, refreshCatalogTrendSignals } from "./trend-repository";

describe("catalog trend insights repository", () => {
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

  it("calculates catalog trends and inserts idempotent trend spike signals", async () => {
    const databaseUrl = database.container.getConnectionUri();
    await expect(getInsightDigest(databaseUrl)).resolves.toMatchObject({
      counts: {
        watchHitsToday: 0,
        lowCatalogStockToday: 0,
        lowLiveStockToday: 0,
        restocksToday: 0,
        fastMoverCandidatesToday: 0,
      },
      topSignals: [],
      topGenres: [],
      topLabels: [],
    });
    await createWatchRule(databaseUrl, { type: "artist", pattern: "Lara Voss" });
    await createWatchRule(databaseUrl, { type: "label", pattern: "Blue Note" });
    await createWatchRule(databaseUrl, { type: "genre", pattern: "Jazz" });
    await createWatchRule(databaseUrl, { type: "keyword", pattern: "standard" });

    const previous = await recordCatalogAttachment({
      databaseUrl,
      supplierCode: "juno",
      message: message("message-trend-previous"),
      attachment: {
        filename: "Juno Wholesale New Releases In Stock 10 June 2026.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        byteSize: 100,
        sha256: "attachment-trend-previous",
        storageUri: "/tmp/trend-previous.xlsx",
        catalog: catalogFromItems("content-hash-trend-previous", [
          ...items(3, { label: "Blue Note", genre: "Jazz", prefix: "previous-jazz", blueNoteCount: 2 }),
          item(50, { junoId: "previous-house-1", label: "House Tools", genre: "House" }),
        ]),
      },
    });
    const current = await recordCatalogAttachment({
      databaseUrl,
      supplierCode: "juno",
      message: message("message-trend-current"),
      attachment: {
        filename: "Juno Wholesale New Releases In Stock 17 June 2026.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        byteSize: 100,
        sha256: "attachment-trend-current",
        storageUri: "/tmp/trend-current.xlsx",
        catalog: catalogFromItems("content-hash-trend-current", [
          ...items(9, { label: "Blue Note", genre: "Jazz", prefix: "current-jazz", blueNoteCount: 7 }),
          item(70, { junoId: "current-ambient-1", label: "Ambient Works", genre: "Ambient" }),
          item(80, { junoId: "current-null-fields", label: null, genre: null }),
        ]),
      },
    });
    await database.pool.query("UPDATE catalog_snapshot SET created_at = $2 WHERE id = $1", [
      previous.snapshotId,
      "2026-06-05T00:00:00.000Z",
    ]);
    await database.pool.query("UPDATE catalog_snapshot SET created_at = $2 WHERE id = $1", [
      current.snapshotId,
      "2026-06-17T00:00:00.000Z",
    ]);
    await processInsightsForSnapshot({ databaseUrl, snapshotId: previous.snapshotId });
    await processInsightsForSnapshot({ databaseUrl, snapshotId: current.snapshotId });

    const trends = await getCatalogTrends({
      databaseUrl,
      now: new Date("2026-06-17T12:00:00.000Z"),
      windowDays: 7,
      previousWindowDays: 7,
      limit: 20,
    });
    const firstRefresh = await refreshCatalogTrendSignals({
      databaseUrl,
      now: new Date("2026-06-17T12:00:00.000Z"),
      windowDays: 7,
      previousWindowDays: 7,
      limit: 20,
    });
    const secondRefresh = await refreshCatalogTrendSignals({
      databaseUrl,
      now: new Date("2026-06-17T12:00:00.000Z"),
      windowDays: 7,
      previousWindowDays: 7,
      limit: 20,
    });
    const trendSignalCount = await database.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM signal_event WHERE type = 'trend_spike'",
    );
    const digest = await getInsightDigest(databaseUrl);

    expect(trends.genres[0]).toMatchObject({
      key: "jazz",
      label: "Jazz",
      currentCount: 9,
      previousCount: 3,
      delta: 6,
      percentChange: 200,
      watchHitCount: 34,
    });
    expect(trends.labels[0]).toMatchObject({
      key: "blue note",
      label: "Blue Note",
      currentCount: 7,
      previousCount: 2,
      delta: 5,
      percentChange: 250,
      watchHitCount: 28,
    });
    expect(trends.labels.find((bucket) => bucket.key === "ambient works")).toMatchObject({
      percentChange: null,
    });
    expect(trends.genres.find((bucket) => bucket.key === "house")).toMatchObject({
      delta: -1,
      percentChange: -100,
    });
    expect(trends.watchOverlap.map((bucket) => bucket.label)).toEqual(
      expect.arrayContaining(["Artist: Lara Voss", "Genre: Jazz", "Keyword: standard", "Label: Blue Note"]),
    );
    expect(firstRefresh).toEqual({ signalsInserted: 2, trendSpikes: 2 });
    expect(secondRefresh).toEqual({ signalsInserted: 0, trendSpikes: 2 });
    expect(trendSignalCount.rows[0].count).toBe("2");
    expect(digest.counts.watchHitsToday).toBeGreaterThan(0);
    expect(digest.topGenres[0].label).toBe("Jazz");
    expect(digest.topLabels[0].label).toBe("Blue Note");
    await expect(
      refreshCatalogTrendSignals({
        databaseUrl,
        now: new Date("not-a-date"),
      }),
    ).rejects.toThrow();
  });
});

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

function catalogFromItems(contentHash: string, catalogItems: ParsedCatalog["items"]): ParsedCatalog {
  return {
    kind: "in_stock",
    catalogDate: "2026-06-17",
    sheetName: "Sheet1",
    contentHash,
    rowCount: catalogItems.length,
    items: catalogItems,
  };
}

function items(
  count: number,
  options: { label: string; genre: string; prefix: string; blueNoteCount: number },
): ParsedCatalog["items"] {
  return Array.from({ length: count }, (_, index) =>
    item(index + 1, {
      junoId: `${options.prefix}-${index + 1}`,
      label: index < options.blueNoteCount ? options.label : "Other Label",
      genre: options.genre,
    }),
  );
}

function item(rowNumber: number, overrides: Partial<ParsedCatalog["items"][number]>): ParsedCatalog["items"][number] {
  return {
    rowNumber,
    junoId: `juno-${rowNumber}`,
    artist: "Lara Voss",
    title: `Signal Path ${rowNumber}`,
    label: "Blue Note",
    catNo: `BN-${rowNumber}`,
    barcode: `${rowNumber}`.padStart(13, "0"),
    medium: "LP",
    description: "standard issue",
    genre: "Jazz",
    dealerExVatText: "GBP 10.00",
    dealerPriceGbp: 10,
    releaseDate: "2026-06-21",
    stock: 5,
    maxOrder: null,
    raw: { rowNumber },
    ...overrides,
  };
}
