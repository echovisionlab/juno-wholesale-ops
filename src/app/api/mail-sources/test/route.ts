import { requireAdmin } from "@/lib/auth/admin";
import { getDatabaseUrl } from "@/lib/env";
import {
  listMailboxSources,
  type MailboxIngestSource,
  type MailboxSourceInput,
  type MailboxSourcePatch,
} from "@/lib/ingest/mail-source";
import { testMailboxSourceConnection } from "@/lib/ingest/mail-source-test";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authorization = await requireAdmin(request);
  if (!authorization.authorized) {
    return authorization.response;
  }

  try {
    const payload = (await parseJson(request)) as Partial<MailboxSourcePatch>;
    const input = await resolveMailboxSourceTestInput(getDatabaseUrl(), payload);
    const test = await testMailboxSourceConnection(input);
    return Response.json({ test });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 400 });
  }
}

async function resolveMailboxSourceTestInput(
  databaseUrl: string,
  payload: Partial<MailboxSourcePatch>,
): Promise<MailboxSourceInput> {
  if (!payload.id) {
    return payload as MailboxSourceInput;
  }

  const sources = await listMailboxSources(databaseUrl);
  const existing = sources.find((source) => source.id === payload.id);
  if (!existing) {
    throw new Error("mail_source_not_found");
  }

  return mergeMailboxSourcePatch(existing, payload);
}

function mergeMailboxSourcePatch(
  existing: MailboxIngestSource,
  patch: Partial<MailboxSourcePatch>,
): MailboxSourceInput {
  return {
    name: patch.name ?? existing.name,
    provider: patch.provider ?? existing.provider,
    authType: patch.authType ?? existing.authType,
    credentialType: patch.credentialType ?? existing.credentialType,
    credentialSecret: patch.credentialSecret !== undefined ? patch.credentialSecret : existing.credentialSecret,
    credentialReference: patch.credentialReference !== undefined ? patch.credentialReference : existing.credentialReference,
    scopes: patch.scopes !== undefined ? patch.scopes : existing.scopes,
    mailboxAddress: patch.mailboxAddress ?? existing.mailboxAddress,
    displayName: patch.displayName !== undefined ? patch.displayName : existing.displayName,
    providerMailboxId: patch.providerMailboxId,
    query: patch.query ?? existing.query,
    maxResults: patch.maxResults ?? existing.maxResults,
    lookbackMs: patch.lookbackMs ?? existing.lookbackMs,
    processedLabel: patch.processedLabel !== undefined ? patch.processedLabel : existing.processedLabel,
    storageDir: patch.storageDir ?? existing.storageDir,
    attachmentPattern: patch.attachmentPattern ?? existing.attachmentPattern,
    supplierCode: patch.supplierCode ?? existing.supplierCode,
    isActive: patch.isActive ?? existing.isActive,
  };
}

async function parseJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new Error("Request body must be valid JSON");
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Invalid mail source test request";
}
