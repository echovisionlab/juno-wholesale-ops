import crypto from "node:crypto";
import { GOOGLE_GMAIL_MODIFY_SCOPE, hasGmailModifyScope, parseScopes } from "@/lib/env";
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
import { parseJunoCatalog, type ParsedCatalog } from "@/lib/ingest/juno-parser";
import {
  getMailboxIngestState,
  recordCatalogAttachment,
  recordGmailIngestFinished,
  recordGmailIngestStarted,
  type MessageRecord,
} from "@/lib/ingest/repository";
import {
  assertRunnableGmailMailboxSource,
  getRunnableGmailSources,
  toAttachmentStorageConfig,
  type MailboxIngestSource,
  type RunnableGmailMailboxSource,
} from "@/lib/ingest/settings";
import { processInsightsForSnapshot, type InsightsProcessingResult } from "@/lib/insights/repository";
import { enqueueLiveLookupJobs } from "@/lib/juno-live/repository";
import { storeAttachment, type AttachmentStorageConfig } from "@/lib/storage/attachment-storage";

export type GmailIngestMessageRef = {
  id: string;
  threadId?: string;
};

export type GmailIngestClient = {
  listMessages(query: string, maxResults: number): Promise<GmailIngestMessageRef[]>;
  getMessage(messageId: string): Promise<GmailMessage>;
  getAttachment(messageId: string, attachmentId: string): Promise<Buffer>;
  addLabel(messageId: string, labelId: string): Promise<void>;
  getOrCreateLabel(name: string): Promise<string>;
};

export type GmailIngestLiveSettings = {
  enqueueOnIngest: boolean;
  maxAttempts: number;
};

export type SourceRunResult = {
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

export type GmailIngestRunResult = {
  dryRun: boolean;
  labelMode: boolean;
  sourceCount: number;
  totals: ReturnType<typeof totalResults>;
  sources: SourceRunResult[];
};

export type GmailIngestRunnerDependencies = {
  createGmailClient?: (source: RunnableGmailMailboxSource) => Promise<GmailIngestClient>;
  storeAttachment?: (options: {
    storage: AttachmentStorageConfig;
    sha256: string;
    filename: string;
    bytes: Buffer;
  }) => Promise<string>;
  parseCatalog?: (bytes: Buffer, filename: string) => Promise<ParsedCatalog>;
  recordCatalogAttachment?: typeof recordCatalogAttachment;
  processInsightsForSnapshot?: (options: {
    databaseUrl: string;
    snapshotId: string;
  }) => Promise<InsightsProcessingResult>;
  enqueueLiveLookupJobs?: (options: {
    databaseUrl: string;
    snapshotId: string;
    maxAttempts: number;
  }) => Promise<{ enqueued: number }>;
};

export async function runGmailIngest(options: {
  databaseUrl: string;
  sources: MailboxIngestSource[];
  writeMode: boolean;
  labelMode: boolean;
  liveSettings: GmailIngestLiveSettings;
  dependencies?: GmailIngestRunnerDependencies;
}): Promise<GmailIngestRunResult> {
  const gmailSources = getRunnableGmailSources(options.sources);
  if (options.sources.length === 0) {
    throw new Error("No active mail sources are configured. Create a mail source with an implemented read-only adapter before running ingest.");
  }
  if (gmailSources.length === 0) {
    throw new Error("No runnable mail sources are configured. Non-Gmail provider adapters are not implemented yet.");
  }
  if (options.labelMode && !options.writeMode) {
    throw new Error("Gmail label mode requires write mode because it modifies mailbox labels.");
  }

  const sourceResults: SourceRunResult[] = [];
  for (const source of gmailSources) {
    assertRunnableGmailMailboxSource(source);
    if (options.labelMode && !hasGmailModifyScope(source.scopes)) {
      throw new Error(`Gmail label mode for ${source.mailboxAddress} requires ${GOOGLE_GMAIL_MODIFY_SCOPE}`);
    }
    sourceResults.push(await processGmailIngestSource({
      databaseUrl: options.databaseUrl,
      source,
      writeMode: options.writeMode,
      labelMode: options.labelMode,
      liveSettings: options.liveSettings,
      dependencies: options.dependencies,
    }));
  }

  return {
    dryRun: !options.writeMode,
    labelMode: options.labelMode,
    sourceCount: gmailSources.length,
    totals: totalResults(sourceResults),
    sources: sourceResults,
  };
}

async function processGmailIngestSource(options: {
  databaseUrl: string;
  source: RunnableGmailMailboxSource;
  writeMode: boolean;
  labelMode: boolean;
  liveSettings: GmailIngestLiveSettings;
  dependencies?: GmailIngestRunnerDependencies;
}): Promise<SourceRunResult> {
  const dependencies = resolveDependencies(options.dependencies);
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
  let messages: GmailIngestMessageRef[] = [];
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
    const gmail = await dependencies.createGmailClient(options.source);
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
        let storageUri: string | null = null;
        if (options.writeMode) {
          storageUri = await dependencies.storeAttachment({
            storage: toAttachmentStorageConfig(options.source),
            sha256,
            filename: attachment.filename,
            bytes,
          });
        }
        const catalog = await dependencies.parseCatalog(bytes, attachment.filename);
        attachmentCount += 1;
        parsedRows += catalog.rowCount;

        let dbResult: Record<string, unknown> | null = null;
        if (options.writeMode) {
          dbResult = await dependencies.recordCatalogAttachment({
            databaseUrl: options.databaseUrl,
            supplierCode: options.source.supplierCode,
            message: buildMessageRecord(options.source, message),
            attachment: {
              filename: attachment.filename,
              mimeType: attachment.mimeType,
              byteSize: bytes.byteLength,
              sha256,
              storageUri: storageUri!,
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

            const insightsResult = await dependencies.processInsightsForSnapshot({
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
            const enqueueResult = await dependencies.enqueueLiveLookupJobs({
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

export function totalResults(results: SourceRunResult[]) {
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

export function buildMessageRecord(source: RunnableGmailMailboxSource, message: GmailMessage): MessageRecord {
  const internalDate = message.internalDate ? Number(message.internalDate) : null;
  return {
    provider: "gmail",
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

function getMessageReceivedAt(message: GmailMessage): string | null {
  const internalDate = message.internalDate ? Number(message.internalDate) : null;
  return internalDate ? new Date(internalDate).toISOString() : null;
}

export function maxIso(left: string | null, right: string | null): string | null {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  return Date.parse(right) > Date.parse(left) ? right : left;
}

function resolveDependencies(dependencies: GmailIngestRunnerDependencies | undefined): Required<GmailIngestRunnerDependencies> {
  return {
    createGmailClient: dependencies?.createGmailClient ?? createDefaultGmailClient,
    storeAttachment: dependencies?.storeAttachment ?? storeAttachment,
    parseCatalog: dependencies?.parseCatalog ?? parseJunoCatalog,
    recordCatalogAttachment: dependencies?.recordCatalogAttachment ?? recordCatalogAttachment,
    processInsightsForSnapshot: dependencies?.processInsightsForSnapshot ?? processInsightsForSnapshot,
    enqueueLiveLookupJobs: dependencies?.enqueueLiveLookupJobs ?? enqueueLiveLookupJobs,
  };
}

async function createDefaultGmailClient(source: RunnableGmailMailboxSource): Promise<GmailIngestClient> {
  const key = parseServiceAccountKeyJson(source.credentialSecret);
  const accessToken = await getDelegatedAccessToken({
    key,
    subject: source.mailboxAddress,
    scopes: parseScopes(source.scopes),
  });
  return new GmailClient(source.mailboxAddress, accessToken);
}
