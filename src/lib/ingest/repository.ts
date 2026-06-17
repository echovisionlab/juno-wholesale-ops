import { Pool, type PoolClient } from "pg";
import type { GmailMessage } from "./gmail";
import type { ParsedCatalog } from "./juno-parser";

export type MessageRecord = {
  userEmail: string;
  gmailMessageId: string;
  gmailThreadId: string | null;
  rfc822MessageId: string | null;
  subject: string | null;
  fromAddress: string | null;
  toAddresses: string[];
  deliveredTo: string[];
  receivedAt: string | null;
  payload: GmailMessage;
};

export type AttachmentRecord = {
  filename: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  storageUri: string;
  catalog: ParsedCatalog;
};

export type GmailIngestState = {
  lastQuery: string | null;
  lastQueryWindowFrom: string | null;
  lastQueryWindowTo: string | null;
  lastQueryStartedAt: string | null;
  lastQueryFinishedAt: string | null;
  lastQueryStatus: "running" | "succeeded" | "failed" | null;
  lastQueryError: string | null;
  lastQueryMessageCount: number;
  lastQueryAttachmentCount: number;
  lastSuccessfulMessageReceivedAt: string | null;
  lastIngestedSnapshotId: string | null;
  lastIngestedCatalogDate: string | null;
  lastIngestedContentHash: string | null;
};

export async function recordCatalogAttachment(options: {
  databaseUrl: string;
  supplierCode: string;
  message: MessageRecord;
  attachment: AttachmentRecord;
}): Promise<{
  snapshotId: string;
  insertedItems: number;
  duplicateSnapshot: boolean;
  duplicateContent: boolean;
}> {
  const pool = new Pool({ connectionString: options.databaseUrl, max: 2 });
  const client = await pool.connect();
  try {
    return await withTransaction(client, async () => {
      const supplier = await client.query<{ id: string }>(
        `
          INSERT INTO supplier (code, name)
          VALUES ($1, $2)
          ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
          RETURNING id
        `,
        [options.supplierCode, options.supplierCode.toUpperCase()],
      );

      const message = await client.query<{ id: string }>(
        `
          INSERT INTO mail_message (
            gmail_user_email,
            gmail_message_id,
            gmail_thread_id,
            rfc822_message_id,
            subject,
            from_address,
            to_addresses,
            delivered_to,
            received_at,
            payload
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          ON CONFLICT (gmail_user_email, gmail_message_id) DO UPDATE SET
            first_seen_at = mail_message.first_seen_at
          RETURNING id
        `,
        [
          options.message.userEmail,
          options.message.gmailMessageId,
          options.message.gmailThreadId,
          options.message.rfc822MessageId,
          options.message.subject,
          options.message.fromAddress,
          options.message.toAddresses,
          options.message.deliveredTo,
          options.message.receivedAt,
          JSON.stringify(options.message.payload),
        ],
      );

      const attachment = await client.query<{ id: string }>(
        `
          INSERT INTO mail_attachment (
            message_id,
            filename,
            mime_type,
            byte_size,
            sha256,
            storage_uri
          )
          VALUES ($1,$2,$3,$4,$5,$6)
          ON CONFLICT (message_id, sha256) DO UPDATE SET
            storage_uri = EXCLUDED.storage_uri
          RETURNING id
        `,
        [
          message.rows[0].id,
          options.attachment.filename,
          options.attachment.mimeType,
          options.attachment.byteSize,
          options.attachment.sha256,
          options.attachment.storageUri,
        ],
      );

      const snapshot = await client.query<{ id: string; inserted: boolean }>(
        `
          INSERT INTO catalog_snapshot (
            supplier_id,
            catalog_kind,
            catalog_date,
            source_filename,
            source_attachment_id,
            content_hash,
            row_count
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7)
          ON CONFLICT (supplier_id, content_hash) DO UPDATE SET
            source_attachment_id = catalog_snapshot.source_attachment_id
          RETURNING id, (xmax = 0) AS inserted
        `,
        [
          supplier.rows[0].id,
          options.attachment.catalog.kind,
          options.attachment.catalog.catalogDate,
          options.attachment.filename,
          attachment.rows[0].id,
          options.attachment.catalog.contentHash,
          options.attachment.catalog.rowCount,
        ],
      );

      const snapshotId = snapshot.rows[0].id;
      let insertedItems = 0;
      if (snapshot.rows[0].inserted) {
        for (const item of options.attachment.catalog.items) {
          await client.query(
            `
              INSERT INTO catalog_item_raw (
                snapshot_id,
                row_number,
                juno_id,
                barcode,
                artist,
                title,
                label,
                cat_no,
                medium,
                description,
                genre,
                dealer_ex_vat_text,
                dealer_price_gbp,
                stock,
                release_date,
                max_order,
                raw
              )
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
              ON CONFLICT (snapshot_id, row_number) DO NOTHING
            `,
            [
              snapshotId,
              item.rowNumber,
              item.junoId,
              item.barcode,
              item.artist,
              item.title,
              item.label,
              item.catNo,
              item.medium,
              item.description,
              item.genre,
              item.dealerExVatText,
              item.dealerPriceGbp,
              item.stock,
              item.releaseDate,
              item.maxOrder,
              JSON.stringify(item.raw),
            ],
          );
          insertedItems += 1;
        }
      }

      return {
        snapshotId,
        insertedItems,
        duplicateSnapshot: !snapshot.rows[0].inserted,
        duplicateContent: !snapshot.rows[0].inserted,
      };
    });
  } finally {
    client.release();
    await pool.end();
  }
}

export async function getGmailIngestState(databaseUrl: string): Promise<GmailIngestState> {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const result = await pool.query<{
      last_query: string | null;
      last_query_window_from: string | null;
      last_query_window_to: string | null;
      last_query_started_at: string | null;
      last_query_finished_at: string | null;
      last_query_status: "running" | "succeeded" | "failed" | null;
      last_query_error: string | null;
      last_query_message_count: number;
      last_query_attachment_count: number;
      last_successful_message_received_at: string | null;
      last_ingested_snapshot_id: string | null;
      last_ingested_catalog_date: string | null;
      last_ingested_content_hash: string | null;
    }>(
      `
        SELECT
          last_query,
          last_query_window_from::text AS last_query_window_from,
          last_query_window_to::text AS last_query_window_to,
          last_query_started_at::text AS last_query_started_at,
          last_query_finished_at::text AS last_query_finished_at,
          last_query_status,
          last_query_error,
          last_query_message_count,
          last_query_attachment_count,
          last_successful_message_received_at::text AS last_successful_message_received_at,
          last_ingested_snapshot_id::text AS last_ingested_snapshot_id,
          last_ingested_catalog_date::text AS last_ingested_catalog_date,
          last_ingested_content_hash
        FROM gmail_ingest_state
        WHERE id = true
      `,
    );
    const row = result.rows[0];
    return {
      lastQuery: row?.last_query ?? null,
      lastQueryWindowFrom: row?.last_query_window_from ?? null,
      lastQueryWindowTo: row?.last_query_window_to ?? null,
      lastQueryStartedAt: row?.last_query_started_at ?? null,
      lastQueryFinishedAt: row?.last_query_finished_at ?? null,
      lastQueryStatus: row?.last_query_status ?? null,
      lastQueryError: row?.last_query_error ?? null,
      lastQueryMessageCount: row?.last_query_message_count ?? 0,
      lastQueryAttachmentCount: row?.last_query_attachment_count ?? 0,
      lastSuccessfulMessageReceivedAt: row?.last_successful_message_received_at ?? null,
      lastIngestedSnapshotId: row?.last_ingested_snapshot_id ?? null,
      lastIngestedCatalogDate: row?.last_ingested_catalog_date ?? null,
      lastIngestedContentHash: row?.last_ingested_content_hash ?? null,
    };
  } finally {
    await pool.end();
  }
}

export async function recordGmailIngestStarted(options: {
  databaseUrl: string;
  query: string;
  windowFrom: string | null;
  windowTo: string;
}): Promise<void> {
  const pool = new Pool({ connectionString: options.databaseUrl, max: 1 });
  try {
    await pool.query(
      `
        INSERT INTO gmail_ingest_state (
          id,
          last_query,
          last_query_window_from,
          last_query_window_to,
          last_query_started_at,
          last_query_status,
          last_query_error,
          updated_at
        )
        VALUES (true, $1, $2, $3, now(), 'running', NULL, now())
        ON CONFLICT (id) DO UPDATE SET
          last_query = EXCLUDED.last_query,
          last_query_window_from = EXCLUDED.last_query_window_from,
          last_query_window_to = EXCLUDED.last_query_window_to,
          last_query_started_at = EXCLUDED.last_query_started_at,
          last_query_status = EXCLUDED.last_query_status,
          last_query_error = NULL,
          updated_at = now()
      `,
      [options.query, options.windowFrom, options.windowTo],
    );
  } finally {
    await pool.end();
  }
}

export async function recordGmailIngestFinished(options: {
  databaseUrl: string;
  status: "succeeded" | "failed";
  error: string | null;
  messageCount: number;
  attachmentCount: number;
  lastSuccessfulMessageReceivedAt: string | null;
  lastIngestedSnapshotId: string | null;
  lastIngestedCatalogDate: string | null;
  lastIngestedContentHash: string | null;
}): Promise<void> {
  const pool = new Pool({ connectionString: options.databaseUrl, max: 1 });
  try {
    await pool.query(
      `
        UPDATE gmail_ingest_state
        SET last_query_finished_at = now(),
            last_query_status = $1,
            last_query_error = $2,
            last_query_message_count = $3,
            last_query_attachment_count = $4,
            last_successful_message_received_at = COALESCE($5, last_successful_message_received_at),
            last_ingested_snapshot_id = COALESCE($6, last_ingested_snapshot_id),
            last_ingested_catalog_date = COALESCE($7, last_ingested_catalog_date),
            last_ingested_content_hash = COALESCE($8, last_ingested_content_hash),
            updated_at = now()
        WHERE id = true
      `,
      [
        options.status,
        options.error,
        options.messageCount,
        options.attachmentCount,
        options.lastSuccessfulMessageReceivedAt,
        options.lastIngestedSnapshotId,
        options.lastIngestedCatalogDate,
        options.lastIngestedContentHash,
      ],
    );
  } finally {
    await pool.end();
  }
}

async function withTransaction<T>(client: PoolClient, fn: () => Promise<T>): Promise<T> {
  await client.query("BEGIN");
  try {
    const result = await fn();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
