import { Pool, type PoolClient } from "pg";
import { GOOGLE_GMAIL_READONLY_SCOPE } from "@/lib/env";
import { assertMailProviderImplemented, getMailProviderDescriptor } from "./mail-provider-registry";
import type {
  AttachmentStorageBackend,
  AttachmentStorageConfig,
} from "@/lib/storage/attachment-storage";

export type MailProvider = "gmail" | "imap" | "microsoft_graph" | "generic";
export type MailAuthType = "google_workspace_delegation" | "basic" | "oauth2" | "api_token" | "none";
export type MailCredentialType = "google_service_account_json" | "password" | "oauth_client_secret" | "api_token" | "none";

export type MailboxIngestSource = {
  id: string;
  connectionId: string;
  name: string;
  provider: MailProvider;
  authType: MailAuthType;
  credentialType: MailCredentialType;
  credentialSecret: string | null;
  credentialReference: string | null;
  credentialConfigured: boolean;
  scopes: string;
  mailboxAddress: string;
  displayName: string | null;
  query: string;
  maxResults: number;
  lookbackMs: number;
  processedLabel: string;
  storageBackend: AttachmentStorageBackend;
  storageDir: string;
  storageEndpoint: string;
  storageBucket: string;
  storagePrefix: string;
  storageRegion: string;
  storageAccessKeyId: string;
  storageSecret: string | null;
  storageSecretConfigured: boolean;
  storageForcePathStyle: boolean;
  attachmentPattern: string;
  supplierCode: string;
  isActive: boolean;
};

export type PublicMailboxSource = Omit<MailboxIngestSource, "credentialSecret" | "storageSecret"> & {
  credentialSecret?: never;
  storageSecret?: never;
};

export type RunnableGmailMailboxSource = MailboxIngestSource & {
  provider: "gmail";
  authType: "google_workspace_delegation";
  credentialType: "google_service_account_json";
  credentialSecret: string;
};

export type MailboxSourceInput = {
  name: string;
  provider: MailProvider;
  authType: MailAuthType;
  credentialType: MailCredentialType;
  credentialSecret?: string | null;
  credentialReference?: string | null;
  scopes?: string | null;
  mailboxAddress: string;
  displayName?: string | null;
  providerMailboxId?: string | null;
  query: string;
  maxResults?: number;
  lookbackMs?: number;
  processedLabel?: string;
  storageBackend?: AttachmentStorageBackend;
  storageDir?: string;
  storageEndpoint?: string | null;
  storageBucket?: string | null;
  storagePrefix?: string | null;
  storageRegion?: string | null;
  storageAccessKeyId?: string | null;
  storageSecret?: string | null;
  storageForcePathStyle?: boolean;
  attachmentPattern: string;
  supplierCode: string;
  isActive?: boolean;
};

export type MailboxSourcePatch = Partial<MailboxSourceInput> & {
  id: string;
};

export async function listActiveMailboxSources(databaseUrl: string): Promise<MailboxIngestSource[]> {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    return await listActiveMailboxSourcesClient(pool);
  } finally {
    await pool.end();
  }
}

export async function listMailboxSources(databaseUrl: string): Promise<MailboxIngestSource[]> {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    return await listMailboxSourcesClient(pool);
  } finally {
    await pool.end();
  }
}

async function listActiveMailboxSourcesClient(queryable: Pool | PoolClient): Promise<MailboxIngestSource[]> {
  return listMailboxSourcesClient(queryable, { activeOnly: true });
}

async function listMailboxSourcesClient(
  queryable: Pool | PoolClient,
  options: { activeOnly?: boolean } = {},
): Promise<MailboxIngestSource[]> {
  const result = await queryable.query<{
    id: string;
    connection_id: string;
    connection_name: string;
    provider: MailProvider;
    auth_type: MailAuthType;
    credential_type: MailCredentialType;
    credential_secret: string | null;
    credential_reference: string | null;
    config: Record<string, unknown>;
    mailbox_address: string;
    display_name: string | null;
    ingest_query: string;
    max_results: number;
    ingest_lookback_ms: number;
    processed_label: string;
    storage_backend: AttachmentStorageBackend;
    storage_dir: string;
    storage_config: Record<string, unknown>;
    storage_secret: string | null;
    attachment_pattern: string;
    supplier_code: string;
    is_active: boolean;
  }>(
    `
      SELECT
        mail_mailbox_source.id,
        mail_connection.id AS connection_id,
        mail_connection.name AS connection_name,
        mail_connection.provider,
        mail_connection.auth_type,
        mail_connection.credential_type,
        mail_connection.credential_secret,
        mail_connection.credential_reference,
        mail_connection.config,
        mail_mailbox_source.mailbox_address,
        mail_mailbox_source.display_name,
        mail_mailbox_source.ingest_query,
        mail_mailbox_source.max_results,
        mail_mailbox_source.ingest_lookback_ms,
        mail_mailbox_source.processed_label,
        mail_mailbox_source.storage_backend,
        mail_mailbox_source.storage_dir,
        mail_mailbox_source.storage_config,
        mail_mailbox_source.storage_secret,
        mail_mailbox_source.attachment_pattern,
        mail_mailbox_source.supplier_code,
        mail_mailbox_source.is_active
      FROM mail_mailbox_source
      JOIN mail_connection ON mail_connection.id = mail_mailbox_source.connection_id
      WHERE ($1::boolean = false OR (mail_connection.is_active AND mail_mailbox_source.is_active))
      ORDER BY mail_connection.created_at, mail_mailbox_source.created_at
    `,
    [Boolean(options.activeOnly)],
  );

  return result.rows.map((row) => {
    const storageConfig = parseStorageConfig(row.storage_backend, row.storage_config, row.storage_secret, row.storage_dir);
    return {
      id: row.id,
      connectionId: row.connection_id,
      name: row.connection_name,
      provider: row.provider,
      authType: row.auth_type,
      credentialType: row.credential_type,
      credentialSecret: row.credential_secret,
      credentialReference: row.credential_reference,
      credentialConfigured: Boolean(row.credential_secret || row.credential_reference || row.credential_type === "none"),
      scopes: getScopes(row.config),
      mailboxAddress: row.mailbox_address,
      displayName: row.display_name,
      query: row.ingest_query,
      maxResults: row.max_results,
      lookbackMs: row.ingest_lookback_ms,
      processedLabel: row.processed_label,
      storageBackend: storageConfig.backend,
      storageDir: storageConfig.storageDir,
      storageEndpoint: storageConfig.endpoint,
      storageBucket: storageConfig.bucket,
      storagePrefix: storageConfig.prefix,
      storageRegion: storageConfig.region,
      storageAccessKeyId: storageConfig.accessKeyId,
      storageSecret: storageConfig.secretAccessKey,
      storageSecretConfigured: Boolean(storageConfig.secretAccessKey),
      storageForcePathStyle: storageConfig.forcePathStyle,
      attachmentPattern: row.attachment_pattern,
      supplierCode: row.supplier_code,
      isActive: row.is_active,
    };
  });
}

export async function createMailboxSource(
  databaseUrl: string,
  input: MailboxSourceInput,
): Promise<MailboxIngestSource> {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const source = await createMailboxSourceClient(client, input);
    await client.query("COMMIT");
    return source;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

export async function updateMailboxSource(
  databaseUrl: string,
  patch: MailboxSourcePatch,
): Promise<MailboxIngestSource | null> {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const source = await updateMailboxSourceClient(client, patch);
    await client.query("COMMIT");
    return source;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

export async function deleteMailboxSource(databaseUrl: string, id: string): Promise<boolean> {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    const result = await pool.query(
      `
        UPDATE mail_mailbox_source
        SET is_active = false,
            updated_at = now()
        WHERE id = $1
      `,
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    await pool.end();
  }
}

async function createMailboxSourceClient(
  client: PoolClient,
  input: MailboxSourceInput,
): Promise<MailboxIngestSource> {
  const normalized = normalizeMailboxInput(input);
  const connection = await client.query<{ id: string }>(
    `
      INSERT INTO mail_connection (
        name,
        provider,
        auth_type,
        credential_type,
        credential_secret,
        credential_reference,
        config,
        is_active
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING id
    `,
    [
      normalized.name,
      normalized.provider,
      normalized.authType,
      normalized.credentialType,
      normalized.credentialSecret,
      normalized.credentialReference,
      JSON.stringify({ scopes: normalized.scopes }),
      normalized.isActive,
    ],
  );
  await insertMailboxSourceClient(client, connection.rows[0].id, normalized);
  const created = await getMailboxSourceClient(client, connection.rows[0].id, normalized.mailboxAddress);
  if (!created) {
    throw new Error("Mail source was not available after creation");
  }
  return created;
}

async function updateMailboxSourceClient(
  client: PoolClient,
  patch: MailboxSourcePatch,
): Promise<MailboxIngestSource | null> {
  const existing = await getMailboxSourceByIdClient(client, patch.id);
  if (!existing) {
    return null;
  }
  const normalizedPatch = normalizeMailboxPatch(existing, patch);

  const sourceAssignments: string[] = [];
  const sourceValues: unknown[] = [];
  addAssignment(sourceAssignments, sourceValues, "mailbox_address", normalizedPatch.mailboxAddress);
  addAssignment(sourceAssignments, sourceValues, "display_name", normalizedPatch.displayName);
  addAssignment(sourceAssignments, sourceValues, "provider_mailbox_id", normalizedPatch.providerMailboxId);
  addAssignment(sourceAssignments, sourceValues, "ingest_query", normalizedPatch.query);
  addAssignment(sourceAssignments, sourceValues, "max_results", normalizedPatch.maxResults);
  addAssignment(sourceAssignments, sourceValues, "ingest_lookback_ms", normalizedPatch.lookbackMs);
  addAssignment(sourceAssignments, sourceValues, "processed_label", normalizedPatch.processedLabel);
  addAssignment(sourceAssignments, sourceValues, "storage_backend", normalizedPatch.storageBackend);
  addAssignment(sourceAssignments, sourceValues, "storage_dir", normalizedPatch.storageDir);
  if (normalizedPatch.storageConfig !== undefined) {
    sourceValues.push(JSON.stringify(normalizedPatch.storageConfig));
    sourceAssignments.push(`storage_config = $${sourceValues.length}::jsonb`);
  }
  addAssignment(sourceAssignments, sourceValues, "storage_secret", normalizedPatch.storageSecret);
  addAssignment(sourceAssignments, sourceValues, "attachment_pattern", normalizedPatch.attachmentPattern);
  addAssignment(sourceAssignments, sourceValues, "supplier_code", normalizedPatch.supplierCode);
  addAssignment(sourceAssignments, sourceValues, "is_active", normalizedPatch.isActive);
  if (sourceAssignments.length > 0) {
    sourceValues.push(patch.id);
    await client.query(
      `
        UPDATE mail_mailbox_source
        SET ${sourceAssignments.join(", ")},
            updated_at = now()
        WHERE id = $${sourceValues.length}
      `,
      sourceValues,
    );
  }

  const connectionAssignments: string[] = [];
  const connectionValues: unknown[] = [];
  addAssignment(connectionAssignments, connectionValues, "name", normalizedPatch.name);
  addAssignment(connectionAssignments, connectionValues, "provider", normalizedPatch.provider);
  addAssignment(connectionAssignments, connectionValues, "auth_type", normalizedPatch.authType);
  addAssignment(connectionAssignments, connectionValues, "credential_type", normalizedPatch.credentialType);
  addAssignment(connectionAssignments, connectionValues, "credential_secret", normalizedPatch.credentialSecret);
  addAssignment(connectionAssignments, connectionValues, "credential_reference", normalizedPatch.credentialReference);
  if (normalizedPatch.scopes !== undefined) {
    connectionValues.push(JSON.stringify({ scopes: normalizedPatch.scopes }));
    connectionAssignments.push(`config = $${connectionValues.length}::jsonb`);
  }
  addAssignment(connectionAssignments, connectionValues, "is_active", normalizedPatch.isActive);
  if (connectionAssignments.length > 0) {
    connectionValues.push(existing.connectionId);
    await client.query(
      `
        UPDATE mail_connection
        SET ${connectionAssignments.join(", ")},
            updated_at = now()
        WHERE id = $${connectionValues.length}
      `,
      connectionValues,
    );
  }

  return getMailboxSourceByIdClient(client, patch.id);
}

async function insertMailboxSourceClient(
  client: PoolClient,
  connectionId: string,
  input: RequiredMailboxSourceInput,
): Promise<void> {
  await client.query(
    `
      INSERT INTO mail_mailbox_source (
        connection_id,
        mailbox_address,
        display_name,
        provider_mailbox_id,
        ingest_query,
        max_results,
        ingest_lookback_ms,
        processed_label,
        storage_backend,
        storage_dir,
        storage_config,
        storage_secret,
        attachment_pattern,
        supplier_code,
        is_active
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    `,
    [
      connectionId,
      input.mailboxAddress,
      input.displayName,
      input.providerMailboxId,
      input.query,
      input.maxResults,
      input.lookbackMs,
      input.processedLabel,
      input.storageBackend,
      input.storageDir,
      JSON.stringify(buildStorageConfigJson(input)),
      input.storageSecret,
      input.attachmentPattern,
      input.supplierCode,
      input.isActive,
    ],
  );
}

async function getMailboxSourceClient(
  client: PoolClient,
  connectionId: string,
  mailboxAddress: string,
): Promise<MailboxIngestSource | null> {
  const sources = await listMailboxSourcesClient(client);
  return sources.find((source) => source.connectionId === connectionId && source.mailboxAddress === mailboxAddress) ?? null;
}

async function getMailboxSourceByIdClient(
  client: PoolClient,
  id: string,
): Promise<MailboxIngestSource | null> {
  const sources = await listMailboxSourcesClient(client);
  return sources.find((source) => source.id === id) ?? null;
}

export function getRunnableGmailSources(sources: MailboxIngestSource[]): RunnableGmailMailboxSource[] {
  return sources.filter((source): source is RunnableGmailMailboxSource => (
    source.provider === "gmail" &&
    source.authType === "google_workspace_delegation" &&
    source.credentialType === "google_service_account_json" &&
    Boolean(source.credentialSecret)
  ));
}

export function getMissingMailboxSourceSettings(source: MailboxIngestSource): string[] {
  return [
    source.mailboxAddress.trim() ? null : "mailbox_address",
    source.query.trim() ? null : "ingest_query",
    source.attachmentPattern.trim() ? null : "attachment_pattern",
    ...getMissingStorageSettings(source),
    source.supplierCode.trim() ? null : "supplier_code",
    source.credentialConfigured ? null : "credential",
    source.provider === "gmail" && source.credentialType !== "google_service_account_json"
      ? "google_service_account_json credential"
      : null,
  ].filter((value): value is string => Boolean(value));
}

export function assertRunnableGmailMailboxSource(
  source: MailboxIngestSource,
): asserts source is RunnableGmailMailboxSource {
  const missing = getMissingMailboxSourceSettings(source);
  if (source.provider !== "gmail") {
    throw new Error(`Mail provider ${source.provider} is configured but no ingest adapter is implemented yet`);
  }
  if (missing.length > 0) {
    throw new Error(`Mail source ${source.mailboxAddress || source.id} is incomplete: ${missing.join(", ")}`);
  }
  if (!source.credentialSecret) {
    throw new Error(`Mail source ${source.mailboxAddress} credential is not readable by this runtime`);
  }
}

export function redactMailboxSource(source: MailboxIngestSource): PublicMailboxSource {
  const { credentialSecret, storageSecret, ...publicSource } = source;
  void credentialSecret;
  void storageSecret;
  return publicSource as PublicMailboxSource;
}

export function toAttachmentStorageConfig(source: MailboxIngestSource): AttachmentStorageConfig {
  if (source.storageBackend === "local_drive") {
    return {
      backend: "local_drive",
      storageDir: source.storageDir,
    };
  }
  return {
    backend: "s3_compatible",
    endpoint: source.storageEndpoint,
    bucket: source.storageBucket,
    prefix: source.storagePrefix,
    region: source.storageRegion,
    accessKeyId: source.storageAccessKeyId,
    secretAccessKey: source.storageSecret,
    forcePathStyle: source.storageForcePathStyle,
  };
}

type RequiredMailboxSourceInput = Required<Pick<
  MailboxSourceInput,
  | "name"
  | "provider"
  | "authType"
  | "credentialType"
  | "mailboxAddress"
  | "query"
  | "maxResults"
  | "lookbackMs"
  | "processedLabel"
  | "storageBackend"
  | "storageDir"
  | "storageEndpoint"
  | "storageBucket"
  | "storagePrefix"
  | "storageRegion"
  | "storageAccessKeyId"
  | "storageForcePathStyle"
  | "attachmentPattern"
  | "supplierCode"
  | "isActive"
>> & {
  credentialSecret: string | null;
  credentialReference: string | null;
  scopes: string;
  displayName: string | null;
  providerMailboxId: string | null;
  storageSecret: string | null;
  storageConfig: Record<string, unknown>;
};

type NormalizedMailboxSourcePatch = Partial<RequiredMailboxSourceInput> & {
  id: string;
  storageConfig?: Record<string, unknown>;
};

function normalizeMailboxInput(input: MailboxSourceInput): RequiredMailboxSourceInput {
  const normalized: RequiredMailboxSourceInput = {
    name: requiredText("name", input.name),
    provider: input.provider,
    authType: input.authType,
    credentialType: input.credentialType,
    credentialSecret: normalizeNullableText(input.credentialSecret),
    credentialReference: normalizeNullableText(input.credentialReference),
    scopes: input.provider === "gmail" ? GOOGLE_GMAIL_READONLY_SCOPE : normalizeText(input.scopes) ?? GOOGLE_GMAIL_READONLY_SCOPE,
    mailboxAddress: requiredText("mailbox_address", input.mailboxAddress),
    displayName: normalizeNullableText(input.displayName),
    providerMailboxId: normalizeNullableText(input.providerMailboxId),
    query: requiredText("ingest_query", input.query),
    maxResults: input.maxResults ?? 25,
    lookbackMs: input.lookbackMs ?? 604800000,
    processedLabel: input.processedLabel?.trim() || "Wholesale Processed",
    storageBackend: input.storageBackend ?? "local_drive",
    storageDir: input.storageBackend === "s3_compatible"
      ? normalizeText(input.storageDir) ?? ".data/mail-attachments"
      : requiredText("storage_dir", input.storageDir),
    storageEndpoint: normalizeNullableText(input.storageEndpoint) ?? "",
    storageBucket: normalizeNullableText(input.storageBucket) ?? "",
    storagePrefix: normalizeText(input.storagePrefix) ?? "mail-attachments",
    storageRegion: normalizeText(input.storageRegion) ?? "us-east-1",
    storageAccessKeyId: normalizeNullableText(input.storageAccessKeyId) ?? "",
    storageSecret: normalizeNullableText(input.storageSecret),
    storageForcePathStyle: input.storageForcePathStyle ?? true,
    storageConfig: {},
    attachmentPattern: requiredText("attachment_pattern", input.attachmentPattern),
    supplierCode: requiredText("supplier_code", input.supplierCode),
    isActive: input.isActive ?? true,
  };
  validateMailboxInput(normalized);
  return normalized;
}

function normalizeMailboxPatch(
  existing: MailboxIngestSource,
  patch: MailboxSourcePatch,
): NormalizedMailboxSourcePatch {
  const normalized = normalizeMailboxInput({
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
    processedLabel: patch.processedLabel ?? existing.processedLabel,
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
  });

  return {
    id: patch.id,
    name: patch.name !== undefined ? normalized.name : undefined,
    provider: patch.provider !== undefined ? normalized.provider : undefined,
    authType: patch.authType !== undefined ? normalized.authType : undefined,
    credentialType: patch.credentialType !== undefined ? normalized.credentialType : undefined,
    credentialSecret: patch.credentialSecret !== undefined ? normalized.credentialSecret : undefined,
    credentialReference: patch.credentialReference !== undefined ? normalized.credentialReference : undefined,
    scopes: patch.scopes !== undefined ? normalized.scopes : undefined,
    mailboxAddress: patch.mailboxAddress !== undefined ? normalized.mailboxAddress : undefined,
    displayName: patch.displayName !== undefined ? normalized.displayName : undefined,
    providerMailboxId: patch.providerMailboxId !== undefined ? normalized.providerMailboxId : undefined,
    query: patch.query !== undefined ? normalized.query : undefined,
    maxResults: patch.maxResults !== undefined ? normalized.maxResults : undefined,
    lookbackMs: patch.lookbackMs !== undefined ? normalized.lookbackMs : undefined,
    processedLabel: patch.processedLabel !== undefined ? normalized.processedLabel : undefined,
    storageBackend: patch.storageBackend !== undefined ? normalized.storageBackend : undefined,
    storageDir: patch.storageDir !== undefined ? normalized.storageDir : undefined,
    storageEndpoint: patch.storageEndpoint !== undefined ? normalized.storageEndpoint : undefined,
    storageBucket: patch.storageBucket !== undefined ? normalized.storageBucket : undefined,
    storagePrefix: patch.storagePrefix !== undefined ? normalized.storagePrefix : undefined,
    storageRegion: patch.storageRegion !== undefined ? normalized.storageRegion : undefined,
    storageAccessKeyId: patch.storageAccessKeyId !== undefined ? normalized.storageAccessKeyId : undefined,
    storageSecret: patch.storageSecret !== undefined ? normalized.storageSecret : undefined,
    storageForcePathStyle: patch.storageForcePathStyle !== undefined ? normalized.storageForcePathStyle : undefined,
    storageConfig: hasStoragePatch(patch) ? buildStorageConfigJson(normalized) : undefined,
    attachmentPattern: patch.attachmentPattern !== undefined ? normalized.attachmentPattern : undefined,
    supplierCode: patch.supplierCode !== undefined ? normalized.supplierCode : undefined,
    isActive: patch.isActive !== undefined ? normalized.isActive : undefined,
  };
}

function validateMailboxInput(input: RequiredMailboxSourceInput): void {
  assertMailProviderImplemented(input.provider);
  const provider = getMailProviderDescriptor(input.provider);
  if (input.authType !== provider.authType || input.credentialType !== provider.credentialType) {
    throw new Error(`${provider.label} mail sources require ${provider.authType} auth and ${provider.credentialType} credentials`);
  }
  if (input.credentialType !== "none" && !input.credentialSecret && !input.credentialReference) {
    throw new Error("Mail source credential secret or reference is required");
  }
  if (input.maxResults < 1 || input.maxResults > 500) {
    throw new Error("Mail source max results must be between 1 and 500");
  }
  if (input.lookbackMs <= 0) {
    throw new Error("Mail source lookback must be positive");
  }
  if (input.storageBackend === "s3_compatible") {
    if (!input.storageEndpoint) {
      throw new Error("S3-compatible storage endpoint is required");
    }
    if (!input.storageBucket) {
      throw new Error("S3-compatible storage bucket is required");
    }
    if (!input.storageAccessKeyId) {
      throw new Error("S3-compatible storage access key id is required");
    }
    if (!input.storageSecret) {
      throw new Error("S3-compatible storage secret access key is required");
    }
  }
}

function addAssignment(
  assignments: string[],
  values: unknown[],
  column: string,
  value: unknown,
): void {
  if (value === undefined) {
    return;
  }
  values.push(value);
  assignments.push(`${column} = $${values.length}`);
}

function requiredText(name: string, value: string | null | undefined): string {
  const text = normalizeText(value);
  if (!text) {
    throw new Error(`${name} is required`);
  }
  return text;
}

function normalizeNullableText(value: string | null | undefined): string | null {
  return normalizeText(value) ?? null;
}

function normalizeText(value: string | null | undefined): string | undefined {
  const text = value?.trim();
  return text || undefined;
}

function getScopes(config: Record<string, unknown>): string {
  const scopes = config.scopes;
  return typeof scopes === "string" && scopes.trim() ? scopes : GOOGLE_GMAIL_READONLY_SCOPE;
}

function buildStorageConfigJson(input: RequiredMailboxSourceInput): Record<string, unknown> {
  if (input.storageBackend === "local_drive") {
    return {};
  }
  return {
    endpoint: input.storageEndpoint,
    bucket: input.storageBucket,
    prefix: input.storagePrefix,
    region: input.storageRegion,
    accessKeyId: input.storageAccessKeyId,
    forcePathStyle: input.storageForcePathStyle,
  };
}

function parseStorageConfig(
  backend: AttachmentStorageBackend,
  config: Record<string, unknown>,
  secret: string | null,
  storageDir: string,
): {
  backend: AttachmentStorageBackend;
  storageDir: string;
  endpoint: string;
  bucket: string;
  prefix: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string | null;
  forcePathStyle: boolean;
} {
  return {
    backend,
    storageDir,
    endpoint: stringConfig(config, "endpoint"),
    bucket: stringConfig(config, "bucket"),
    prefix: stringConfig(config, "prefix") || "mail-attachments",
    region: stringConfig(config, "region") || "us-east-1",
    accessKeyId: stringConfig(config, "accessKeyId"),
    secretAccessKey: secret,
    forcePathStyle: booleanConfig(config, "forcePathStyle", true),
  };
}

function getMissingStorageSettings(source: MailboxIngestSource): string[] {
  if (source.storageBackend === "local_drive") {
    return source.storageDir.trim() ? [] : ["storage_dir"];
  }
  return [
    source.storageEndpoint.trim() ? null : "storage_endpoint",
    source.storageBucket.trim() ? null : "storage_bucket",
    source.storageAccessKeyId.trim() ? null : "storage_access_key_id",
    source.storageSecretConfigured ? null : "storage_secret",
  ].filter((value): value is string => Boolean(value));
}

function hasStoragePatch(patch: MailboxSourcePatch): boolean {
  return [
    "storageBackend",
    "storageDir",
    "storageEndpoint",
    "storageBucket",
    "storagePrefix",
    "storageRegion",
    "storageAccessKeyId",
    "storageSecret",
    "storageForcePathStyle",
  ].some((key) => key in patch);
}

function stringConfig(config: Record<string, unknown>, key: string): string {
  const value = config[key];
  return typeof value === "string" ? value : "";
}

function booleanConfig(config: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = config[key];
  return typeof value === "boolean" ? value : fallback;
}
