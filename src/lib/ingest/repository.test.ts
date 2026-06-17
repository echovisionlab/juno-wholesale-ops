import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  resetApplicationTables,
  startMigratedPostgresTestDatabase,
  type StartedPostgresTestDatabase,
} from "@/test/postgres";
import {
  getGmailIngestState,
  recordCatalogAttachment,
  recordGmailIngestFinished,
  recordGmailIngestStarted,
  type MessageRecord,
} from "./repository";
import type { ParsedCatalog } from "./juno-parser";

describe("recordCatalogAttachment", () => {
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

  it("persists catalog rows only once for duplicate sheet content", async () => {
    const first = await recordCatalogAttachment({
      databaseUrl: database.container.getConnectionUri(),
      supplierCode: "juno",
      message: message("message-1"),
      attachment: {
        filename: "Juno Wholesale New Preorders 16 June 2026.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        byteSize: 100,
        sha256: "attachment-hash-1",
        storageUri: "/tmp/one.xlsx",
        catalog: catalog({ kind: "preorder", catalogDate: "2026-06-16" }),
      },
    });
    const second = await recordCatalogAttachment({
      databaseUrl: database.container.getConnectionUri(),
      supplierCode: "juno",
      message: message("message-2"),
      attachment: {
        filename: "Juno Wholesale New Releases In Stock 17 June 2026.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        byteSize: 100,
        sha256: "attachment-hash-2",
        storageUri: "/tmp/two.xlsx",
        catalog: catalog({ kind: "in_stock", catalogDate: "2026-06-17" }),
      },
    });

    const snapshots = await database.pool.query<{ count: string }>("SELECT count(*)::text FROM catalog_snapshot");
    const items = await database.pool.query<{ count: string }>("SELECT count(*)::text FROM catalog_item_raw");
    const messages = await database.pool.query<{ count: string }>("SELECT count(*)::text FROM mail_message");
    const attachments = await database.pool.query<{ count: string }>("SELECT count(*)::text FROM mail_attachment");

    expect(first).toMatchObject({ insertedItems: 1, duplicateSnapshot: false, duplicateContent: false });
    expect(second).toMatchObject({
      snapshotId: first.snapshotId,
      insertedItems: 0,
      duplicateSnapshot: true,
      duplicateContent: true,
    });
    expect(snapshots.rows[0].count).toBe("1");
    expect(items.rows[0].count).toBe("1");
    expect(messages.rows[0].count).toBe("2");
    expect(attachments.rows[0].count).toBe("2");
  });

  it("records Gmail ingest cursor state in the singleton row", async () => {
    const databaseUrl = database.container.getConnectionUri();
    const snapshot = await recordCatalogAttachment({
      databaseUrl,
      supplierCode: "juno",
      message: message("message-1"),
      attachment: {
        filename: "Juno Wholesale New Preorders 17 June 2026.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        byteSize: 100,
        sha256: "attachment-hash-1",
        storageUri: "/tmp/one.xlsx",
        catalog: catalog({ kind: "preorder", catalogDate: "2026-06-17" }),
      },
    });

    await recordGmailIngestStarted({
      databaseUrl,
      query: "to:catalog@example.com filename:xlsx after:2026/06/10",
      windowFrom: "2026-06-10T00:00:00.000Z",
      windowTo: "2026-06-17T00:00:00.000Z",
    });
    await recordGmailIngestFinished({
      databaseUrl,
      status: "succeeded",
      error: null,
      messageCount: 2,
      attachmentCount: 1,
      lastSuccessfulMessageReceivedAt: "2026-06-17T01:00:00.000Z",
      lastIngestedSnapshotId: snapshot.snapshotId,
      lastIngestedCatalogDate: "2026-06-17",
      lastIngestedContentHash: "same-sheet-content-hash",
    });

    await expect(getGmailIngestState(databaseUrl)).resolves.toMatchObject({
      lastQuery: "to:catalog@example.com filename:xlsx after:2026/06/10",
      lastQueryWindowFrom: "2026-06-10 00:00:00+00",
      lastQueryWindowTo: "2026-06-17 00:00:00+00",
      lastQueryStatus: "succeeded",
      lastQueryError: null,
      lastQueryMessageCount: 2,
      lastQueryAttachmentCount: 1,
      lastSuccessfulMessageReceivedAt: "2026-06-17 01:00:00+00",
      lastIngestedSnapshotId: snapshot.snapshotId,
      lastIngestedCatalogDate: "2026-06-17",
      lastIngestedContentHash: "same-sheet-content-hash",
    });
  });

  it("does not advance the Gmail message cursor when a later ingest fails", async () => {
    const databaseUrl = database.container.getConnectionUri();
    await recordGmailIngestStarted({
      databaseUrl,
      query: "filename:xlsx",
      windowFrom: null,
      windowTo: "2026-06-17T00:00:00.000Z",
    });
    await recordGmailIngestFinished({
      databaseUrl,
      status: "succeeded",
      error: null,
      messageCount: 1,
      attachmentCount: 1,
      lastSuccessfulMessageReceivedAt: "2026-06-17T01:00:00.000Z",
      lastIngestedSnapshotId: null,
      lastIngestedCatalogDate: null,
      lastIngestedContentHash: null,
    });
    await recordGmailIngestStarted({
      databaseUrl,
      query: "filename:xlsx after:2026/06/10",
      windowFrom: "2026-06-10T00:00:00.000Z",
      windowTo: "2026-06-18T00:00:00.000Z",
    });
    await recordGmailIngestFinished({
      databaseUrl,
      status: "failed",
      error: "Gmail API 500",
      messageCount: 0,
      attachmentCount: 0,
      lastSuccessfulMessageReceivedAt: null,
      lastIngestedSnapshotId: null,
      lastIngestedCatalogDate: null,
      lastIngestedContentHash: null,
    });

    await expect(getGmailIngestState(databaseUrl)).resolves.toMatchObject({
      lastQueryStatus: "failed",
      lastQueryError: "Gmail API 500",
      lastSuccessfulMessageReceivedAt: "2026-06-17 01:00:00+00",
    });
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
    receivedAt: "2026-06-17T00:00:00.000Z",
    payload: { id: gmailMessageId, payload: { headers: [] } },
  };
}

function catalog(overrides: Pick<ParsedCatalog, "kind" | "catalogDate">): ParsedCatalog {
  return {
    ...overrides,
    sheetName: "Sheet1",
    contentHash: "same-sheet-content-hash",
    rowCount: 1,
    items: [
      {
        rowNumber: 2,
        junoId: "1148569-01",
        artist: "Artist",
        title: "Title",
        label: "Label",
        catNo: "CAT",
        barcode: "123",
        medium: "Vinyl",
        description: "LP",
        genre: "Rock",
        dealerExVatText: "£10.00",
        dealerPriceGbp: 10,
        releaseDate: null,
        stock: 2,
        maxOrder: null,
        raw: { "Juno ID": "1148569-01" },
      },
    ],
  };
}
