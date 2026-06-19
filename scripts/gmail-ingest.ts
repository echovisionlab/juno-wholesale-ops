import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { GOOGLE_GMAIL_MODIFY_SCOPE, hasGmailModifyScope, loadRuntimeEnv, parseScopes } from "@/lib/env";
import {
  decodeBase64Url,
  findXlsxAttachments,
  getAllHeaders,
  getHeader,
  GmailClient,
  type GmailMessage,
} from "@/lib/ingest/gmail";
import { buildGmailIngestQueryPlan } from "@/lib/ingest/gmail-query";
import { getDelegatedAccessToken, parseServiceAccountKeyJson } from "@/lib/ingest/google-auth";
import { parseJunoCatalog } from "@/lib/ingest/juno-parser";
import {
  getMailboxIngestState,
  recordCatalogAttachment,
  recordGmailIngestFinished,
  recordGmailIngestStarted,
} from "@/lib/ingest/repository";
import {
  assertRunnableGmailMailboxSource,
  getRunnableGmailSources,
  listActiveMailboxSources,
  type RunnableGmailMailboxSource,
} from "@/lib/ingest/settings";
import { processInsightsForSnapshot } from "@/lib/insights/repository";
import { enqueueLiveLookupJobs, withJunoLiveRepository } from "@/lib/juno-live/repository";
import { resolveJunoLiveSettings } from "@/lib/juno-live/settings";

async function main() {
  const writeMode = process.argv.includes("--write");
  const labelMode = process.argv.includes("--label");
  const env = loadRuntimeEnv();
  const databaseUrl = env.DATABASE_URL;
  const settingsRow =
    writeMode
      ? await withJunoLiveRepository(databaseUrl, (repository) => repository.getServiceSettingsRow())
      : null;
  const liveSettings =
    writeMode
      ? resolveJunoLiveSettings(settingsRow)
      : resolveJunoLiveSettings(null);

  const sources = await listActiveMailboxSources(databaseUrl);
  const gmailSources = getRunnableGmailSources(sources);
  if (sources.length === 0) {
    throw new Error("No active mail sources are configured. Create a Gmail mailbox source before running ingest.");
  }
  if (gmailSources.length === 0) {
    throw new Error("No runnable Gmail mailbox sources are configured. Other mail providers are not implemented yet.");
  }

  const sourceResults: SourceRunResult[] = [];
  for (const source of gmailSources) {
    assertRunnableGmailMailboxSource(source);
    if (labelMode && !hasGmailModifyScope(source.scopes)) {
      throw new Error(`Gmail label mode for ${source.mailboxAddress} requires ${GOOGLE_GMAIL_MODIFY_SCOPE}`);
    }
    sourceResults.push(await processSource({
      databaseUrl,
      source,
      writeMode,
      labelMode,
      liveSettings,
    }));
  }

  console.log(
    JSON.stringify(
      {
        dryRun: !writeMode,
        labelMode,
        sourceCount: gmailSources.length,
        totals: totalResults(sourceResults),
        sources: sourceResults,
      },
      null,
      2,
    ),
  );
}

type SourceRunResult = {
  sourceId: string;
  mailboxAddress: string;
  query: string;
  queryWindowFrom: string | null;
  queryWindowTo: string;
  incrementalQuery: boolean;
  attachmentPattern: string;
  messages: number;
  attachments: number;
  parsedRows: number;
  duplicateSnapshots: number;
  duplicateContent: number;
  liveLookupJobs: number;
  insights: {
    identityUpserts: number;
    watchMatches: number;
    signals: number;
  };
  lastSuccessfulMessageReceivedAt: string | null;
  lastIngestedSnapshotId: string | null;
  lastIngestedCatalogDate: string | null;
  lastIngestedContentHash: string | null;
  results: Array<Record<string, unknown>>;
};

async function processSource(options: {
  databaseUrl: string;
  source: RunnableGmailMailboxSource;
  writeMode: boolean;
  labelMode: boolean;
  liveSettings: ReturnType<typeof resolveJunoLiveSettings>;
}): Promise<SourceRunResult> {
  const ingestState = options.writeMode
    ? await getMailboxIngestState(options.databaseUrl, options.source.id)
    : null;
  const queryPlan = buildGmailIngestQueryPlan({
    baseQuery: options.source.query,
    lastSuccessfulMessageReceivedAt: ingestState?.lastSuccessfulMessageReceivedAt,
    lookbackMs: options.source.lookbackMs,
  });

  if (options.writeMode) {
    await recordGmailIngestStarted({
      databaseUrl: options.databaseUrl,
      mailboxSourceId: options.source.id,
      query: queryPlan.query,
      windowFrom: queryPlan.windowFrom,
      windowTo: queryPlan.windowTo,
    });
  }

  const attachmentPattern = new RegExp(options.source.attachmentPattern, "i");
  let messages: Awaited<ReturnType<GmailClient["listMessages"]>> = [];
  let attachmentCount = 0;
  let parsedRows = 0;
  let duplicateSnapshots = 0;
  let duplicateContent = 0;
  let liveLookupJobs = 0;
  let insightIdentityUpserts = 0;
  let insightWatchMatches = 0;
  let insightSignals = 0;
  let lastSuccessfulMessageReceivedAt: string | null = ingestState?.lastSuccessfulMessageReceivedAt ?? null;
  let lastIngestedSnapshotId: string | null = null;
  let lastIngestedCatalogDate: string | null = null;
  let lastIngestedContentHash: string | null = null;
  const results: Array<Record<string, unknown>> = [];

  try {
    const key = parseServiceAccountKeyJson(options.source.credentialSecret);
    const accessToken = await getDelegatedAccessToken({
      key,
      subject: options.source.mailboxAddress,
      scopes: parseScopes(options.source.scopes),
    });
    const gmail = new GmailClient(options.source.mailboxAddress, accessToken);
    messages = await gmail.listMessages(queryPlan.query, options.source.maxResults);
    const processedLabelId = options.labelMode ? await gmail.getOrCreateLabel(options.source.processedLabel) : null;

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
        const storageUri = await saveAttachment(options.source.storageDir, sha256, attachment.filename, bytes);
        const catalog = await parseJunoCatalog(bytes, attachment.filename);
        attachmentCount += 1;
        parsedRows += catalog.rowCount;

        let dbResult: Record<string, unknown> | null = null;
        if (options.writeMode) {
          dbResult = await recordCatalogAttachment({
            databaseUrl: options.databaseUrl,
            supplierCode: options.source.supplierCode,
            message: buildMessageRecord(options.source, message),
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

            const insightsResult = await processInsightsForSnapshot({
              databaseUrl: options.databaseUrl,
              snapshotId: dbResult.snapshotId,
            });
            insightIdentityUpserts += insightsResult.identityUpserts;
            insightWatchMatches += insightsResult.watchMatches;
            insightSignals += insightsResult.signals;
            dbResult = {
              ...dbResult,
              insights: insightsResult,
            };
          }
          if (options.liveSettings.enqueueOnIngest && !dbResult.duplicateContent && typeof dbResult.snapshotId === "string") {
            const enqueueResult = await enqueueLiveLookupJobs({
              databaseUrl: options.databaseUrl,
              snapshotId: dbResult.snapshotId,
              maxAttempts: options.liveSettings.maxAttempts,
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

    if (options.writeMode) {
      await recordGmailIngestFinished({
        databaseUrl: options.databaseUrl,
        mailboxSourceId: options.source.id,
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
  } catch (error) {
    if (options.writeMode) {
      await recordGmailIngestFinished({
        databaseUrl: options.databaseUrl,
        mailboxSourceId: options.source.id,
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

  return {
    sourceId: options.source.id,
    mailboxAddress: options.source.mailboxAddress,
    query: queryPlan.query,
    queryWindowFrom: queryPlan.windowFrom,
    queryWindowTo: queryPlan.windowTo,
    incrementalQuery: queryPlan.incremental,
    attachmentPattern: options.source.attachmentPattern,
    messages: messages.length,
    attachments: attachmentCount,
    parsedRows,
    duplicateSnapshots,
    duplicateContent,
    liveLookupJobs,
    insights: {
      identityUpserts: insightIdentityUpserts,
      watchMatches: insightWatchMatches,
      signals: insightSignals,
    },
    lastSuccessfulMessageReceivedAt,
    lastIngestedSnapshotId,
    lastIngestedCatalogDate,
    lastIngestedContentHash,
    results,
  };
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

function buildMessageRecord(source: RunnableGmailMailboxSource, message: GmailMessage) {
  const internalDate = message.internalDate ? Number(message.internalDate) : null;
  return {
    provider: "gmail" as const,
    mailboxAddress: source.mailboxAddress,
    mailboxSourceId: source.id,
    providerMessageId: message.id,
    providerThreadId: message.threadId ?? null,
    rfc822MessageId: getHeader(message, "Message-ID") ?? null,
    subject: getHeader(message, "Subject") ?? null,
    fromAddress: getHeader(message, "From") ?? null,
    toAddresses: getAllHeaders(message, "To"),
    deliveredTo: getAllHeaders(message, "Delivered-To"),
    receivedAt: internalDate ? new Date(internalDate).toISOString() : null,
    payload: message,
  };
}

function totalResults(results: SourceRunResult[]) {
  return results.reduce(
    (totals, result) => ({
      messages: totals.messages + result.messages,
      attachments: totals.attachments + result.attachments,
      parsedRows: totals.parsedRows + result.parsedRows,
      duplicateSnapshots: totals.duplicateSnapshots + result.duplicateSnapshots,
      duplicateContent: totals.duplicateContent + result.duplicateContent,
      liveLookupJobs: totals.liveLookupJobs + result.liveLookupJobs,
      insights: {
        identityUpserts: totals.insights.identityUpserts + result.insights.identityUpserts,
        watchMatches: totals.insights.watchMatches + result.insights.watchMatches,
        signals: totals.insights.signals + result.insights.signals,
      },
    }),
    {
      messages: 0,
      attachments: 0,
      parsedRows: 0,
      duplicateSnapshots: 0,
      duplicateContent: 0,
      liveLookupJobs: 0,
      insights: {
        identityUpserts: 0,
        watchMatches: 0,
        signals: 0,
      },
    },
  );
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
