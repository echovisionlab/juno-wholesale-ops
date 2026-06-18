import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  resetApplicationTables,
  startMigratedPostgresTestDatabase,
  testMailboxSourceId,
  type StartedPostgresTestDatabase,
} from "@/test/postgres";
import { recordCatalogAttachment, type MessageRecord } from "@/lib/ingest/repository";
import type { ParsedCatalog } from "@/lib/ingest/juno-parser";
import {
  createWatchRule,
  deleteWatchRule,
  getTodaySignals,
  listWatchRules,
  matchWatchRulesForSnapshot,
  processInsightsForSnapshot,
  updateWatchRule,
  upsertCatalogItemIdentitiesForSnapshot,
} from "./repository";

describe("insights repository", () => {
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

  it("upserts item identities, records watch matches, and generates idempotent signals", async () => {
    const databaseUrl = database.container.getConnectionUri();
    const snapshot = await recordCatalogAttachment({
      databaseUrl,
      supplierCode: "juno",
      message: message("message-1"),
      attachment: {
        filename: "Juno Wholesale New Releases In Stock 17 June 2026.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        byteSize: 100,
        sha256: "attachment-hash-1",
        storageUri: "/tmp/one.xlsx",
        catalog: catalog({
          contentHash: "content-hash-1",
          description: "Limited edition with damaged sleeve note",
          stock: 2,
        }),
      },
    });
    await createWatchRule(databaseUrl, { type: "artist", pattern: "Lara Voss", weight: 10 });
    await createWatchRule(databaseUrl, { type: "label", pattern: "Blue Note", weight: 5 });
    await createWatchRule(databaseUrl, { type: "keyword", pattern: "limited edition", weight: 7 });
    await createWatchRule(databaseUrl, { type: "exclude_keyword", pattern: "damaged sleeve", weight: -20 });
    await createWatchRule(databaseUrl, { type: "genre", pattern: "Jazz", weight: 3, enabled: false });

    await expect(upsertCatalogItemIdentitiesForSnapshot({ databaseUrl, snapshotId: snapshot.snapshotId })).resolves.toEqual({
      identityUpserts: 0,
    });
    const firstRun = await processInsightsForSnapshot({ databaseUrl, snapshotId: snapshot.snapshotId });
    const secondRun = await processInsightsForSnapshot({ databaseUrl, snapshotId: snapshot.snapshotId });
    const identityRows = await database.pool.query<{ count: string }>("SELECT count(*)::text FROM catalog_item_identity");
    const identityKeys = await database.pool.query<{ identity_key: string }>("SELECT identity_key FROM catalog_item_identity");
    const rawRows = await database.pool.query<{ missing_identity_count: string }>(
      "SELECT count(*)::text AS missing_identity_count FROM catalog_item_raw WHERE identity_id IS NULL",
    );
    const signals = await getTodaySignals(databaseUrl, 20);

    expect(snapshot).toMatchObject({
      insertedItems: 1,
      identityUpserts: 1,
      duplicateContent: false,
    });
    expect(firstRun).toEqual({ identityUpserts: 0, watchMatches: 4, signals: 4 });
    expect(secondRun).toEqual({ identityUpserts: 0, watchMatches: 0, signals: 0 });
    expect(identityRows.rows[0].count).toBe("1");
    expect(identityKeys.rows[0].identity_key).toBe("juno:1148569 01");
    expect(rawRows.rows[0].missing_identity_count).toBe("0");
    expect(signals.map((signal) => signal.type).sort()).toEqual([
      "exclude_match",
      "low_catalog_stock",
      "new_arrival",
      "watch_hit",
    ]);
    expect(signals.find((signal) => signal.type === "watch_hit")).toMatchObject({
      score: 2,
      item: {
        artist: "Lara Voss",
        title: "Signal Path",
        label: "Blue Note",
        stock: 2,
      },
      reasons: expect.arrayContaining([
        'Artist exactly matches "Lara Voss".',
        'Label exactly matches "Blue Note".',
        'Description contains "limited edition".',
        'Description contains "damaged sleeve".',
      ]),
    });
    await expect(
      upsertCatalogItemIdentitiesForSnapshot({ databaseUrl, snapshotId: "not-a-uuid" }),
    ).rejects.toThrow();
  });

  it("keeps watch rule CRUD typed and reruns matching without duplicate inserts", async () => {
    const databaseUrl = database.container.getConnectionUri();
    const created = await createWatchRule(databaseUrl, { type: "keyword", pattern: "ambient", weight: 12 });
    const defaultPositive = await createWatchRule(databaseUrl, { type: "artist", pattern: "Lara Voss" });
    const defaultExclude = await createWatchRule(databaseUrl, { type: "exclude_keyword", pattern: "damaged" });
    const updatedDuplicate = await createWatchRule(databaseUrl, {
      type: "keyword",
      pattern: "Ambient",
      weight: 14,
      enabled: false,
    });
    const enabledAgain = await updateWatchRule(databaseUrl, {
      id: created.id,
      enabled: true,
      pattern: "Ambient Techno",
      weight: 16,
    });
    const typeOnlyPatch = await updateWatchRule(databaseUrl, {
      id: created.id,
      type: "label",
    });
    const missingUpdate = await updateWatchRule(databaseUrl, {
      id: "00000000-0000-0000-0000-000000000000",
      enabled: false,
    });
    const rules = await listWatchRules(databaseUrl);

    await expect(createWatchRule(databaseUrl, { type: "keyword", pattern: "", weight: 1 })).rejects.toThrow(
      "Watch rule pattern is required",
    );
    await expect(createWatchRule(databaseUrl, { type: "keyword", pattern: "x", weight: 101 })).rejects.toThrow(
      "Watch rule weight must be an integer between -100 and 100",
    );
    await expect(updateWatchRule(databaseUrl, { id: "" })).rejects.toThrow("Watch rule id is required");
    await expect(
      createWatchRule(databaseUrl, { type: "unknown" as never, pattern: "Artist", weight: 1 }),
    ).rejects.toThrow("Watch rule type is invalid");

    expect(defaultPositive.weight).toBe(10);
    expect(defaultExclude.weight).toBe(-10);
    expect(updatedDuplicate.id).toBe(created.id);
    expect(enabledAgain).toMatchObject({ pattern: "Ambient Techno", patternNorm: "ambient techno", enabled: true });
    expect(typeOnlyPatch).toMatchObject({ type: "label", pattern: "Ambient Techno", weight: 16, enabled: true });
    expect(missingUpdate).toBeNull();
    expect(rules).toEqual([
      expect.objectContaining({ id: defaultPositive.id, weight: 10 }),
      expect.objectContaining({ id: defaultExclude.id, weight: -10 }),
      expect.objectContaining({ id: created.id, type: "label", weight: 16 }),
    ]);
    await expect(deleteWatchRule(databaseUrl, created.id)).resolves.toBe(true);
    await expect(deleteWatchRule(databaseUrl, created.id)).resolves.toBe(false);
  });

  it("does not generate a second new-arrival signal for an identity seen in an older snapshot", async () => {
    const databaseUrl = database.container.getConnectionUri();
    const first = await recordCatalogAttachment({
      databaseUrl,
      supplierCode: "juno",
      message: message("message-1"),
      attachment: {
        filename: "Juno Wholesale New Releases In Stock 17 June 2026.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        byteSize: 100,
        sha256: "attachment-hash-1",
        storageUri: "/tmp/one.xlsx",
        catalog: catalog({ contentHash: "content-hash-1", stock: 5 }),
      },
    });
    await database.pool.query("UPDATE catalog_snapshot SET created_at = now() - interval '1 day' WHERE id = $1", [
      first.snapshotId,
    ]);
    await processInsightsForSnapshot({ databaseUrl, snapshotId: first.snapshotId });

    const second = await recordCatalogAttachment({
      databaseUrl,
      supplierCode: "juno",
      message: message("message-2"),
      attachment: {
        filename: "Juno Wholesale New Releases In Stock 18 June 2026.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        byteSize: 100,
        sha256: "attachment-hash-2",
        storageUri: "/tmp/two.xlsx",
        catalog: catalog({ contentHash: "content-hash-2", stock: 5 }),
      },
    });
    const matchResult = await matchWatchRulesForSnapshot({ databaseUrl, snapshotId: second.snapshotId });
    const signals = await database.pool.query<{ count: string }>(
      "SELECT count(*)::text FROM signal_event WHERE type = 'new_arrival'",
    );

    expect(second.identityUpserts).toBe(1);
    expect(matchResult).toEqual({ matchesInserted: 0, signalsInserted: 0 });
    expect(signals.rows[0].count).toBe("1");
  });

  it("skips rows without identity keys and uses safe display fallbacks for sparse signal rows", async () => {
    const databaseUrl = database.container.getConnectionUri();
    const noIdentity = await recordCatalogAttachment({
      databaseUrl,
      supplierCode: "juno",
      message: message("message-empty"),
      attachment: {
        filename: "Juno Wholesale New Releases In Stock 17 June 2026.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        byteSize: 100,
        sha256: "attachment-empty",
        storageUri: "/tmp/empty.xlsx",
        catalog: catalogFromItems("content-hash-empty", [
          item({ rowNumber: 2, junoId: null, barcode: null, artist: null, title: null, label: null, catNo: null }),
        ]),
      },
    });
    await expect(processInsightsForSnapshot({ databaseUrl, snapshotId: noIdentity.snapshotId })).resolves.toEqual({
      identityUpserts: 0,
      watchMatches: 0,
      signals: 0,
    });

    const sparse = await recordCatalogAttachment({
      databaseUrl,
      supplierCode: "juno",
      message: message("message-sparse"),
      attachment: {
        filename: "Juno Wholesale New Releases In Stock 18 June 2026.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        byteSize: 100,
        sha256: "attachment-sparse",
        storageUri: "/tmp/sparse.xlsx",
        catalog: catalogFromItems("content-hash-sparse", [
          item({ rowNumber: 2, junoId: null, barcode: "barcode-title", artist: null, title: "Title Only", label: null, catNo: null }),
          item({ rowNumber: 3, junoId: "JUNO-FALLBACK", barcode: null, artist: null, title: null, label: null, catNo: null }),
          item({ rowNumber: 4, junoId: null, barcode: null, artist: null, title: null, label: "Label Only", catNo: "CAT-FALLBACK" }),
          item({ rowNumber: 5, junoId: null, barcode: "barcode-only", artist: null, title: null, label: null, catNo: null }),
        ]),
      },
    });
    await processInsightsForSnapshot({ databaseUrl, snapshotId: sparse.snapshotId });
    const titles = await database.pool.query<{ title: string }>(
      "SELECT title FROM signal_event WHERE type = 'low_catalog_stock' ORDER BY title",
    );

    expect(noIdentity.identityUpserts).toBe(0);
    expect(sparse.identityUpserts).toBe(4);
    expect(titles.rows.map((row) => row.title)).toEqual([
      "Low catalog stock: CAT-FALLBACK",
      "Low catalog stock: Catalog item",
      "Low catalog stock: JUNO-FALLBACK",
      "Low catalog stock: Title Only",
    ]);
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

function catalog(overrides: {
  contentHash: string;
  description?: string;
  stock?: number;
}): ParsedCatalog {
  return {
    kind: "in_stock",
    catalogDate: "2026-06-17",
    sheetName: "Sheet1",
    contentHash: overrides.contentHash,
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
        description: overrides.description ?? "Standard issue",
        genre: "Jazz",
        dealerExVatText: "£10.00",
        dealerPriceGbp: 10,
        releaseDate: "2026-06-21",
        stock: overrides.stock ?? null,
        maxOrder: null,
        raw: { "Juno ID": "1148569-01" },
      },
    ],
  };
}

function catalogFromItems(contentHash: string, items: ParsedCatalog["items"]): ParsedCatalog {
  return {
    kind: "in_stock",
    catalogDate: "2026-06-17",
    sheetName: "Sheet1",
    contentHash,
    rowCount: items.length,
    items,
  };
}

function item(overrides: Partial<ParsedCatalog["items"][number]>): ParsedCatalog["items"][number] {
  return {
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
    dealerExVatText: "£10.00",
    dealerPriceGbp: 10,
    releaseDate: "2026-06-21",
    stock: 1,
    maxOrder: null,
    raw: { "Juno ID": "1148569-01" },
    ...overrides,
  };
}
