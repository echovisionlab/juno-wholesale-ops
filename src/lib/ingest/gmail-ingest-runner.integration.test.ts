import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import writeXlsxFile, { type Sheet } from "write-excel-file/node";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GOOGLE_GMAIL_MODIFY_SCOPE, GOOGLE_GMAIL_READONLY_SCOPE } from "@/lib/env";
import { createMailboxSource } from "@/lib/ingest/mail-source";
import {
  resetApplicationTables,
  startMigratedPostgresTestDatabase,
  type StartedPostgresTestDatabase,
} from "@/test/postgres";
import { startMinioTestStorage, type StartedMinioTestStorage } from "@/test/minio";
import { runGmailIngest, type GmailIngestClient } from "./gmail-ingest-runner";

describe("Gmail ingest runner integration", () => {
  let database: StartedPostgresTestDatabase | undefined;
  let minio: StartedMinioTestStorage | undefined;
  let s3: S3Client;

  beforeAll(async () => {
    database = await startMigratedPostgresTestDatabase();
    try {
      minio = await startMinioTestStorage();
    } catch (error) {
      await database.stop();
      database = undefined;
      throw error;
    }
    s3 = new S3Client({
      endpoint: minio.endpoint,
      region: minio.region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: minio.accessKeyId,
        secretAccessKey: minio.secretAccessKey,
      },
    });
  });

  beforeEach(async () => {
    if (!database) {
      throw new Error("Postgres test database was not started");
    }
    await resetApplicationTables(database.pool);
  });

  afterAll(async () => {
    await Promise.all([
      database?.stop(),
      minio?.stop(),
    ]);
  });

  it("writes Gmail attachments through MinIO, records catalog data, and remains idempotent", async () => {
    const db = database!;
    const store = minio!;
    const databaseUrl = db.container.getConnectionUri();
    const source = {
      ...(await createMailboxSource(databaseUrl, {
        name: "MinIO Gmail",
        provider: "gmail",
        authType: "google_workspace_delegation",
        credentialType: "google_service_account_json",
        credentialSecret: "{\"client_email\":\"synthetic@example.test\"}",
        mailboxAddress: "ops@example.test",
        query: "filename:xlsx",
        storageBackend: "s3_compatible",
        storageEndpoint: store.endpoint,
        storageBucket: store.bucket,
        storagePrefix: "runner-ingest",
        storageRegion: store.region,
        storageAccessKeyId: store.accessKeyId,
        storageSecret: store.secretAccessKey,
        storageForcePathStyle: true,
        attachmentPattern: "xlsx",
        supplierCode: "juno",
      })),
      scopes: `${GOOGLE_GMAIL_READONLY_SCOPE} ${GOOGLE_GMAIL_MODIFY_SCOPE}`,
    };
    const workbook = await workbookBuffer();
    const gmail = fakeGmailClient(workbook);
    const first = await runGmailIngest({
      databaseUrl,
      sources: [source],
      writeMode: true,
      labelMode: true,
      liveSettings: { enqueueOnIngest: true, maxAttempts: 3 },
      dependencies: {
        createGmailClient: async () => gmail,
        enqueueLiveLookupJobs: async () => ({ enqueued: 2 }),
      },
    });
    const second = await runGmailIngest({
      databaseUrl,
      sources: [source],
      writeMode: true,
      labelMode: true,
      liveSettings: { enqueueOnIngest: true, maxAttempts: 3 },
      dependencies: {
        createGmailClient: async () => gmail,
        enqueueLiveLookupJobs: async () => ({ enqueued: 2 }),
      },
    });
    const counts = await db.pool.query<{
      messages: string;
      attachments: string;
      snapshots: string;
      items: string;
      signals: string;
    }>(
      `
        SELECT
          (SELECT count(*)::text FROM mail_message) AS messages,
          (SELECT count(*)::text FROM mail_attachment) AS attachments,
          (SELECT count(*)::text FROM catalog_snapshot) AS snapshots,
          (SELECT count(*)::text FROM catalog_item_raw) AS items,
          (SELECT count(*)::text FROM signal_event) AS signals
      `,
    );
    const storageUri = first.sources[0].results[0].storageUri as string;
    const objectKey = storageUri.replace(`s3://${store.bucket}/`, "");

    await expect(s3.send(new HeadObjectCommand({
      Bucket: store.bucket,
      Key: objectKey,
    }))).resolves.toMatchObject({
      ContentLength: workbook.byteLength,
    });

    expect(first).toMatchObject({
      dryRun: false,
      sourceCount: 1,
      totals: {
        messages: 1,
        attachments: 1,
        parsedRows: 2,
        duplicateContent: 0,
        liveLookupJobs: 2,
        insights: {
          identityUpserts: 0,
          watchMatches: 0,
          signals: 3,
        },
      },
    });
    expect(first.sources[0].results[0]).toMatchObject({
      filename: "Juno Wholesale New Releases In Stock 20 June 2026.xlsx",
      catalogKind: "in_stock",
      catalogDate: "2026-06-20",
      rowCount: 2,
      db: {
        insertedItems: 2,
        duplicateContent: false,
        liveLookupJobs: 2,
      },
    });
    expect(second).toMatchObject({
      totals: {
        attachments: 1,
        parsedRows: 2,
        duplicateContent: 1,
        liveLookupJobs: 0,
        insights: {
          signals: 0,
        },
      },
    });
    expect(counts.rows[0]).toEqual({
      messages: "1",
      attachments: "1",
      snapshots: "1",
      items: "2",
      signals: "3",
    });
  });

  it("records a failed write-mode ingest without exposing a stack trace", async () => {
    const db = database!;
    const databaseUrl = db.container.getConnectionUri();
    const errorSource = await createMailboxSource(databaseUrl, {
      name: "Error Gmail",
      provider: "gmail",
      authType: "google_workspace_delegation",
      credentialType: "google_service_account_json",
      credentialSecret: "{\"client_email\":\"synthetic@example.test\"}",
      mailboxAddress: "ops-error@example.test",
      query: "filename:xlsx",
      storageDir: ".data/test-mail",
      attachmentPattern: "xlsx",
      supplierCode: "juno",
    });
    const stringSource = await createMailboxSource(databaseUrl, {
      name: "Failing Gmail",
      provider: "gmail",
      authType: "google_workspace_delegation",
      credentialType: "google_service_account_json",
      credentialSecret: "{\"client_email\":\"synthetic@example.test\"}",
      mailboxAddress: "ops-fail@example.test",
      query: "filename:xlsx",
      storageDir: ".data/test-mail",
      attachmentPattern: "xlsx",
      supplierCode: "juno",
    });

    await expect(runGmailIngest({
      databaseUrl,
      sources: [errorSource],
      writeMode: true,
      labelMode: false,
      liveSettings: { enqueueOnIngest: false, maxAttempts: 3 },
      dependencies: {
        createGmailClient: async () => ({
          ...fakeGmailClient(Buffer.from("unused")),
          async listMessages() {
            throw new Error("token refresh failed");
          },
        }),
      },
    })).rejects.toThrow("token refresh failed");

    await expect(runGmailIngest({
      databaseUrl,
      sources: [stringSource],
      writeMode: true,
      labelMode: false,
      liveSettings: { enqueueOnIngest: false, maxAttempts: 3 },
      dependencies: {
        createGmailClient: async () => ({
          ...fakeGmailClient(Buffer.from("unused")),
          async listMessages() {
            throw "network down";
          },
        }),
      },
    })).rejects.toBe("network down");

    const errorState = await db.pool.query<{ last_query_status: string; last_query_error: string }>(
      "SELECT last_query_status, last_query_error FROM mail_mailbox_ingest_state WHERE mailbox_source_id = $1",
      [errorSource.id],
    );
    const stringState = await db.pool.query<{ last_query_status: string; last_query_error: string }>(
      "SELECT last_query_status, last_query_error FROM mail_mailbox_ingest_state WHERE mailbox_source_id = $1",
      [stringSource.id],
    );
    expect(errorState.rows[0]).toEqual({
      last_query_status: "failed",
      last_query_error: "token refresh failed",
    });
    expect(stringState.rows[0]).toEqual({
      last_query_status: "failed",
      last_query_error: "network down",
    });
  });
});

async function workbookBuffer(): Promise<Buffer> {
  const file = await writeXlsxFile(
    [
      {
        sheet: "Stock",
        data: [
          [
            { value: "Artist" },
            { value: "Title" },
            { value: "Juno ID" },
            { value: "Label" },
            { value: "Cat No" },
            { value: "Barcode" },
            { value: "Medium" },
            { value: "Description" },
            { value: "Genre" },
            { value: "Dealer Ex VAT" },
            { value: "Stock" },
          ],
          [
            { value: "Synthetic Artist A" },
            { value: "Synthetic Title A" },
            { value: "synthetic-juno-1" },
            { value: "Synthetic Label" },
            { value: "SYNTH001" },
            { value: "000000000001" },
            { value: "Vinyl" },
            { value: "Synthetic one LP" },
            { value: "Techno" },
            { value: "£10.00" },
            { value: 2 },
          ],
          [
            { value: "Synthetic Artist B" },
            { value: "Synthetic Title B" },
            { value: "synthetic-juno-2" },
            { value: "Synthetic Label" },
            { value: "SYNTH002" },
            { value: "000000000002" },
            { value: "CD" },
            { value: "Synthetic CD" },
            { value: "Jazz" },
            { value: "£12.00" },
            { value: 8 },
          ],
        ],
      },
    ] satisfies Sheet<Buffer>[],
    { buffer: true } as never,
  );
  return (file as { toBuffer: () => Promise<Buffer> }).toBuffer();
}

function fakeGmailClient(bytes: Buffer): GmailIngestClient {
  return {
    async listMessages() {
      return [{ id: "message-1", threadId: "thread-1" }];
    },
    async getMessage() {
      return {
        id: "message-1",
        threadId: "thread-1",
        internalDate: String(Date.UTC(2026, 5, 20)),
        payload: {
          headers: [
            { name: "Message-ID", value: "<message-1@example.test>" },
            { name: "Subject", value: "Juno Wholesale: synthetic stock file" },
            { name: "From", value: "supplier@example.test" },
            { name: "To", value: "ops@example.test" },
          ],
          parts: [
            {
              filename: "Juno Wholesale New Releases In Stock 20 June 2026.xlsx",
              mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              body: {
                attachmentId: "attachment-1",
                size: bytes.byteLength,
              },
            },
          ],
        },
      };
    },
    async getAttachment() {
      return bytes;
    },
    async addLabel() {},
    async getOrCreateLabel() {
      return "label-1";
    },
  };
}
