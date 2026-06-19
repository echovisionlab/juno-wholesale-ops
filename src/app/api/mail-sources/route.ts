import { requireAdmin } from "@/lib/auth/admin";
import { getDatabaseUrl } from "@/lib/env";
import {
  createMailboxSource,
  deleteMailboxSource,
  listMailboxSources,
  redactMailboxSource,
  updateMailboxSource,
  type MailboxIngestSource,
  type MailboxSourceInput,
  type MailboxSourcePatch,
} from "@/lib/ingest/mail-source";
import { testMailboxSourceConnection } from "@/lib/ingest/mail-source-test";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authorization = await requireAdmin(request);
  if (!authorization.authorized) {
    return authorization.response;
  }

  const sources = await listMailboxSources(getDatabaseUrl());
  return Response.json({ sources: sources.map(redactMailboxSource) });
}

export async function POST(request: Request) {
  const authorization = await requireAdmin(request);
  if (!authorization.authorized) {
    return authorization.response;
  }

  try {
    const payload = (await parseJson(request)) as MailSourceMutationPayload;
    if (payload.connectionTestPassed !== true) {
      return Response.json({ error: "mail_source_connection_test_required" }, { status: 400 });
    }
    const input = stripConnectionTestFlag(payload) as MailboxSourceInput;
    const test = await testMailboxSourceConnection(input);
    if (!test.ok) {
      return Response.json({ error: "mail_source_connection_test_failed", test }, { status: 400 });
    }
    const source = await createMailboxSource(getDatabaseUrl(), input);
    return Response.json({ source: redactMailboxSource(source) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const authorization = await requireAdmin(request);
  if (!authorization.authorized) {
    return authorization.response;
  }

  try {
    const databaseUrl = getDatabaseUrl();
    const payload = (await parseJson(request)) as MailSourceMutationPayload;
    if (requiresConnectionTest(payload)) {
      if (isConfigurationPatch(payload) && payload.connectionTestPassed !== true) {
        return Response.json({ error: "mail_source_connection_test_required" }, { status: 400 });
      }
      const existing = await getExistingMailboxSource(databaseUrl, readPayloadId(payload));
      if (!existing) {
        return Response.json({ error: "mail_source_not_found" }, { status: 404 });
      }
      const test = await testMailboxSourceConnection(mergeMailboxSourcePatch(existing, payload));
      if (!test.ok) {
        return Response.json({ error: "mail_source_connection_test_failed", test }, { status: 400 });
      }
    }
    const source = await updateMailboxSource(databaseUrl, stripConnectionTestFlag(payload) as MailboxSourcePatch);
    if (!source) {
      return Response.json({ error: "mail_source_not_found" }, { status: 404 });
    }
    return Response.json({ source: redactMailboxSource(source) });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const authorization = await requireAdmin(request);
  if (!authorization.authorized) {
    return authorization.response;
  }

  try {
    const deleted = await deleteMailboxSource(getDatabaseUrl(), readId(await parseJson(request)));
    if (!deleted) {
      return Response.json({ error: "mail_source_not_found" }, { status: 404 });
    }
    return Response.json({ deleted: true });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 400 });
  }
}

async function parseJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new Error("Request body must be valid JSON");
  }
}

function readId(value: unknown): string {
  if (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    value.id.trim()
  ) {
    return value.id;
  }
  throw new Error("Mail source id is required");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Invalid mail source request";
}

type MailSourceMutationPayload = (MailboxSourceInput | MailboxSourcePatch) & {
  connectionTestPassed?: boolean;
};

async function getExistingMailboxSource(databaseUrl: string, id: string | undefined): Promise<MailboxIngestSource | null> {
  if (!id) {
    return null;
  }
  const sources = await listMailboxSources(databaseUrl);
  return sources.find((source) => source.id === id) ?? null;
}

function requiresConnectionTest(payload: MailSourceMutationPayload): boolean {
  if (!("id" in payload)) {
    return true;
  }
  if (payload.isActive === true && !isConfigurationPatch(payload)) {
    return true;
  }
  return isConfigurationPatch(payload);
}

function isConfigurationPatch(payload: MailSourceMutationPayload): boolean {
  const allowedToggleKeys = new Set(["id", "isActive", "connectionTestPassed"]);
  return Object.keys(payload).some((key) => !allowedToggleKeys.has(key));
}

function stripConnectionTestFlag(payload: MailSourceMutationPayload): MailboxSourceInput | MailboxSourcePatch {
  const { connectionTestPassed, ...cleanPayload } = payload;
  void connectionTestPassed;
  return cleanPayload;
}

function readPayloadId(payload: MailSourceMutationPayload): string | undefined {
  return "id" in payload ? payload.id : undefined;
}

function mergeMailboxSourcePatch(
  existing: MailboxIngestSource,
  patch: MailSourceMutationPayload,
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
    storageBackend: patch.storageBackend ?? existing.storageBackend,
    storageDir: patch.storageDir ?? existing.storageDir,
    storageEndpoint: patch.storageEndpoint !== undefined ? patch.storageEndpoint : existing.storageEndpoint,
    storageBucket: patch.storageBucket !== undefined ? patch.storageBucket : existing.storageBucket,
    storagePrefix: patch.storagePrefix !== undefined ? patch.storagePrefix : existing.storagePrefix,
    storageRegion: patch.storageRegion !== undefined ? patch.storageRegion : existing.storageRegion,
    storageAccessKeyId: patch.storageAccessKeyId !== undefined ? patch.storageAccessKeyId : existing.storageAccessKeyId,
    storageSecret: patch.storageSecret !== undefined ? patch.storageSecret : existing.storageSecret,
    storageForcePathStyle: patch.storageForcePathStyle ?? existing.storageForcePathStyle,
    attachmentPattern: patch.attachmentPattern ?? existing.attachmentPattern,
    supplierCode: patch.supplierCode ?? existing.supplierCode,
    isActive: patch.isActive ?? existing.isActive,
  };
}
