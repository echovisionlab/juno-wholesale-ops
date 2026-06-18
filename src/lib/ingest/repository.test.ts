import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  resetApplicationTables,
  startMigratedPostgresTestDatabase,
  testMailboxSourceId,
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
    await ensureTestMailboxSource(database);
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
    const identities = await database.pool.query<{ count: string }>("SELECT count(*)::text FROM catalog_item_identity");
    const itemsMissingIdentity = await database.pool.query<{ count: string }>(
      "SELECT count(*)::text FROM catalog_item_raw WHERE identity_id IS NULL",
    );
    const messages = await database.pool.query<{ count: string }>("SELECT count(*)::text FROM mail_message");
    const attachments = await database.pool.query<{ count: string }>("SELECT count(*)::text FROM mail_attachment");

    expect(first).toMatchObject({ insertedItems: 1, identityUpserts: 1, duplicateSnapshot: false, duplicateContent: false });
    expect(second).toMatchObject({
      snapshotId: first.snapshotId,
      insertedItems: 0,
      identityUpserts: 0,
      duplicateSnapshot: true,
      duplicateContent: true,
    });
    expect(snapshots.rows[0].count).toBe("1");
    expect(items.rows[0].count).toBe("1");
    expect(identities.rows[0].count).toBe("1");
    expect(itemsMissingIdentity.rows[0].count).toBe("0");
    expect(messages.rows[0].count).toBe("2");
    expect(attachments.rows[0].count).toBe("2");
  });

  it("dedupes against migrated provider mailbox messages without legacy runtime support", async () => {
    const databaseUrl = database.container.getConnectionUri();
    await ensureTestMailboxSource(database);
    await database.pool.query(
      `
        INSERT INTO mail_message (provider, mailbox_address, provider_message_id, payload)
        VALUES ('gmail', 'operator@example.com', 'legacy-message', '{}')
      `,
    );

    await recordCatalogAttachment({
      databaseUrl,
      supplierCode: "juno",
      message: message("legacy-message"),
      attachment: {
        filename: "Juno Wholesale New Preorders 17 June 2026.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        byteSize: 100,
        sha256: "attachment-hash-legacy",
        storageUri: "/tmp/legacy.xlsx",
        catalog: catalog({ kind: "preorder", catalogDate: "2026-06-17" }),
      },
    });

    const messages = await database.pool.query<{ count: string; mailbox_source_id: string | null }>(
      `
        SELECT count(*)::text AS count, max(mailbox_source_id::text) AS mailbox_source_id
        FROM mail_message
        WHERE provider = 'gmail'
          AND mailbox_address = 'operator@example.com'
          AND provider_message_id = 'legacy-message'
      `,
    );
    expect(messages.rows[0]).toEqual({
      count: "1",
      mailbox_source_id: testMailboxSourceId,
    });
  });

  it("records mailbox ingest cursor state per source", async () => {
    const databaseUrl = database.container.getConnectionUri();
    const mailboxSourceId = await ensureTestMailboxSource(database);
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
      mailboxSourceId,
      query: "to:catalog@example.com filename:xlsx after:2026/06/10",
      windowFrom: "2026-06-10T00:00:00.000Z",
      windowTo: "2026-06-17T00:00:00.000Z",
    });
    await recordGmailIngestFinished({
      databaseUrl,
      mailboxSourceId,
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
      mailboxSourceId: await ensureTestMailboxSource(database),
      query: "filename:xlsx",
      windowFrom: null,
      windowTo: "2026-06-17T00:00:00.000Z",
    });
    await recordGmailIngestFinished({
      databaseUrl,
      mailboxSourceId: await ensureTestMailboxSource(database),
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
      mailboxSourceId: await ensureTestMailboxSource(database),
      query: "filename:xlsx after:2026/06/10",
      windowFrom: "2026-06-10T00:00:00.000Z",
      windowTo: "2026-06-18T00:00:00.000Z",
    });
    await recordGmailIngestFinished({
      databaseUrl,
      mailboxSourceId: await ensureTestMailboxSource(database),
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

async function ensureTestMailboxSource(database: StartedPostgresTestDatabase): Promise<string> {
  await database.pool.query(
    `
      INSERT INTO mail_connection (id, name, provider, auth_type, credential_type, credential_secret, is_active, config)
      VALUES (
        '10000000-0000-4000-8000-000000000100',
        'Test Gmail',
        'gmail',
        'google_workspace_delegation',
        'google_service_account_json',
        '{"client_email":"test@example.com","fixture_key":"synthetic-test-key"}',
        true,
        '{"scopes":"https://www.googleapis.com/auth/gmail.readonly"}'
      )
      ON CONFLICT (id) DO NOTHING
    `,
  );
  await database.pool.query(
    `
      INSERT INTO mail_mailbox_source (
        id,
        connection_id,
        mailbox_address,
        display_name,
        ingest_query,
        storage_dir,
        attachment_pattern,
        supplier_code,
        is_active
      )
      VALUES (
        '10000000-0000-4000-8000-000000000101',
        '10000000-0000-4000-8000-000000000100',
        'operator@example.com',
        'Operator',
        'filename:xlsx',
        '.data/test-mail',
        'xlsx',
        'juno',
        true
      )
      ON CONFLICT (id) DO NOTHING
    `,
  );
  return "10000000-0000-4000-8000-000000000101";
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
