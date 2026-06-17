import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { loadRuntimeEnv, parseScopes } from "@/lib/env";
import {
  decodeBase64Url,
  findXlsxAttachments,
  getAllHeaders,
  getHeader,
  GmailClient,
  type GmailMessage,
} from "@/lib/ingest/gmail";
import { buildGmailIngestQueryPlan } from "@/lib/ingest/gmail-query";
import { getDelegatedAccessToken, loadServiceAccountKey } from "@/lib/ingest/google-auth";
import { parseJunoCatalog } from "@/lib/ingest/juno-parser";
import {
  getGmailIngestState,
  recordCatalogAttachment,
  recordGmailIngestFinished,
  recordGmailIngestStarted,
} from "@/lib/ingest/repository";
import { enqueueLiveLookupJobs, withJunoLiveRepository } from "@/lib/juno-live/repository";
import { resolveJunoLiveSettings } from "@/lib/juno-live/settings";

async function main() {
  const writeMode = process.argv.includes("--write");
  const labelMode = process.argv.includes("--label");
  const env = loadRuntimeEnv();
  const liveSettings =
    writeMode && env.DATABASE_URL
      ? resolveJunoLiveSettings(
          env,
          await withJunoLiveRepository(env.DATABASE_URL, (repository) => repository.getServiceSettingsRow()),
        )
      : resolveJunoLiveSettings(env, null);
  if (writeMode && !env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required when using --write");
  }

  const ingestState = writeMode && env.DATABASE_URL ? await getGmailIngestState(env.DATABASE_URL) : null;
  const queryPlan = buildGmailIngestQueryPlan({
    baseQuery: env.GMAIL_INGEST_QUERY,
    lastSuccessfulMessageReceivedAt: ingestState?.lastSuccessfulMessageReceivedAt,
    lookbackMs: liveSettings.gmailIngestLookbackMs,
  });

  if (writeMode && env.DATABASE_URL) {
    await recordGmailIngestStarted({
      databaseUrl: env.DATABASE_URL,
      query: queryPlan.query,
      windowFrom: queryPlan.windowFrom,
      windowTo: queryPlan.windowTo,
    });
  }

  const attachmentPattern = new RegExp(env.CATALOG_ATTACHMENT_PATTERN, "i");
  let messages: Awaited<ReturnType<GmailClient["listMessages"]>> = [];
  let attachmentCount = 0;
  let parsedRows = 0;
  let duplicateSnapshots = 0;
  let duplicateContent = 0;
  let liveLookupJobs = 0;
  let lastSuccessfulMessageReceivedAt: string | null = ingestState?.lastSuccessfulMessageReceivedAt ?? null;
  let lastIngestedSnapshotId: string | null = null;
  let lastIngestedCatalogDate: string | null = null;
  let lastIngestedContentHash: string | null = null;
  const results: Array<Record<string, unknown>> = [];

  try {
    const key = await loadServiceAccountKey(env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON);
    const accessToken = await getDelegatedAccessToken({
      key,
      subject: env.GOOGLE_WORKSPACE_DELEGATED_USER,
      scopes: parseScopes(env.GOOGLE_GMAIL_SCOPES),
    });
    const gmail = new GmailClient(env.GOOGLE_WORKSPACE_DELEGATED_USER, accessToken);
    messages = await gmail.listMessages(queryPlan.query, env.GMAIL_MAX_RESULTS);
    const processedLabelId = labelMode ? await gmail.getOrCreateLabel(env.GMAIL_PROCESSED_LABEL) : null;

    for (const messageRef of messages) {
      const message = await gmail.getMessage(messageRef.id);
      lastSuccessfulMessageReceivedAt = maxIso(
        lastSuccessfulMessageReceivedAt,
        getMessageReceivedAt(message),
      );
      const attachments = findXlsxAttachments(message).filter((attachment) =>
        attachmentPattern.test(attachment.filename),
      );

      for (const attachment of attachments) {
        const bytes = attachment.inlineData
          ? decodeBase64Url(attachment.inlineData)
          : attachment.attachmentId
            ? await gmail.getAttachment(message.id, attachment.attachmentId)
            : null;

        if (!bytes) {
          continue;
        }

        const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
        const storageUri = await saveAttachment(env.GMAIL_STORAGE_DIR, sha256, attachment.filename, bytes);
        const catalog = parseJunoCatalog(bytes, attachment.filename);
        attachmentCount += 1;
        parsedRows += catalog.rowCount;

        let dbResult: Record<string, unknown> | null = null;
        if (writeMode && env.DATABASE_URL) {
          dbResult = await recordCatalogAttachment({
            databaseUrl: env.DATABASE_URL,
            supplierCode: env.SUPPLIER_CODE,
            message: buildMessageRecord(env.GOOGLE_WORKSPACE_DELEGATED_USER, message),
            attachment: {
              filename: attachment.filename,
              mimeType: attachment.mimeType,
              byteSize: bytes.byteLength,
              sha256,
              storageUri,
              catalog,
            },
          });
          if (dbResult.duplicateSnapshot) {
            duplicateSnapshots += 1;
          }
          if (dbResult.duplicateContent) {
            duplicateContent += 1;
          }
          if (!dbResult.duplicateContent && typeof dbResult.snapshotId === "string") {
            lastIngestedSnapshotId = dbResult.snapshotId;
            lastIngestedCatalogDate = catalog.catalogDate;
            lastIngestedContentHash = catalog.contentHash;
          }
          if (liveSettings.enqueueOnIngest && !dbResult.duplicateContent && typeof dbResult.snapshotId === "string") {
            const enqueueResult = await enqueueLiveLookupJobs({
              databaseUrl: env.DATABASE_URL,
              snapshotId: dbResult.snapshotId,
              maxAttempts: liveSettings.maxAttempts,
            });
            liveLookupJobs += enqueueResult.enqueued;
            dbResult = { ...dbResult, liveLookupJobs: enqueueResult.enqueued };
          }
        }

        results.push({
          messageId: message.id,
          rfc822MessageId: getHeader(message, "Message-ID") ?? null,
          receivedAt: getMessageReceivedAt(message),
          filename: attachment.filename,
          sha256,
          storageUri,
          catalogKind: catalog.kind,
          catalogDate: catalog.catalogDate,
          rowCount: catalog.rowCount,
          contentHash: catalog.contentHash,
          db: dbResult,
        });
      }

      if (processedLabelId) {
        await gmail.addLabel(message.id, processedLabelId);
      }
    }

    if (writeMode && env.DATABASE_URL) {
      await recordGmailIngestFinished({
        databaseUrl: env.DATABASE_URL,
        status: "succeeded",
        error: null,
        messageCount: messages.length,
        attachmentCount,
        lastSuccessfulMessageReceivedAt,
        lastIngestedSnapshotId,
        lastIngestedCatalogDate,
        lastIngestedContentHash,
      });
    }

    console.log(
      JSON.stringify(
        {
          dryRun: !writeMode,
          labelMode,
          query: queryPlan.query,
          queryWindowFrom: queryPlan.windowFrom,
          queryWindowTo: queryPlan.windowTo,
          incrementalQuery: queryPlan.incremental,
          attachmentPattern: env.CATALOG_ATTACHMENT_PATTERN,
          messages: messages.length,
          attachments: attachmentCount,
          parsedRows,
          duplicateSnapshots,
          duplicateContent,
          liveLookupJobs,
          lastSuccessfulMessageReceivedAt,
          lastIngestedSnapshotId,
          lastIngestedCatalogDate,
          lastIngestedContentHash,
          results,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    if (writeMode && env.DATABASE_URL) {
      await recordGmailIngestFinished({
        databaseUrl: env.DATABASE_URL,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        messageCount: messages.length,
        attachmentCount,
        lastSuccessfulMessageReceivedAt: null,
        lastIngestedSnapshotId,
        lastIngestedCatalogDate,
        lastIngestedContentHash,
      });
    }
    throw error;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

async function saveAttachment(
  storageDir: string,
  sha256: string,
  filename: string,
  bytes: Buffer,
): Promise<string> {
  const safeFilename = filename.replace(/[^A-Za-z0-9._-]+/g, "_");
  const dir = path.join(storageDir, sha256.slice(0, 2), sha256.slice(2, 4));
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${sha256}-${safeFilename}`);
  await fs.writeFile(filePath, bytes, { flag: "wx" }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") {
      throw error;
    }
  });
  return filePath;
}

function buildMessageRecord(userEmail: string, message: GmailMessage) {
  const internalDate = message.internalDate ? Number(message.internalDate) : null;
  return {
    userEmail,
    gmailMessageId: message.id,
    gmailThreadId: message.threadId ?? null,
    rfc822MessageId: getHeader(message, "Message-ID") ?? null,
    subject: getHeader(message, "Subject") ?? null,
    fromAddress: getHeader(message, "From") ?? null,
    toAddresses: getAllHeaders(message, "To"),
    deliveredTo: getAllHeaders(message, "Delivered-To"),
    receivedAt: internalDate ? new Date(internalDate).toISOString() : null,
    payload: message,
  };
}

function getMessageReceivedAt(message: GmailMessage): string | null {
  const internalDate = message.internalDate ? Number(message.internalDate) : null;
  return internalDate ? new Date(internalDate).toISOString() : null;
}

function maxIso(left: string | null, right: string | null): string | null {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  return Date.parse(right) > Date.parse(left) ? right : left;
}
