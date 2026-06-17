import type { RuntimeEnv } from "@/lib/env";

export type GmailIngestServiceSettingsRow = {
  google_workspace_delegated_user: string | null;
  google_service_account_key_json: string | null;
  google_gmail_scopes: string | null;
  gmail_ingest_query: string | null;
  gmail_max_results: number | null;
  gmail_ingest_lookback_ms: number | null;
  gmail_processed_label: string | null;
  gmail_storage_dir: string | null;
  catalog_attachment_pattern: string | null;
  supplier_code: string | null;
};

export type GmailIngestSettings = {
  delegatedUser: string | undefined;
  serviceAccountKeyJson: string | undefined;
  scopes: string;
  query: string;
  maxResults: number;
  lookbackMs: number;
  processedLabel: string;
  storageDir: string;
  attachmentPattern: string;
  supplierCode: string;
};

export type RunnableGmailIngestSettings = GmailIngestSettings & {
  delegatedUser: string;
  serviceAccountKeyJson: string;
};

export function resolveGmailIngestSettings(
  env: RuntimeEnv,
  row: GmailIngestServiceSettingsRow | null,
): GmailIngestSettings {
  return {
    delegatedUser: row?.google_workspace_delegated_user ?? env.GOOGLE_WORKSPACE_DELEGATED_USER,
    serviceAccountKeyJson: row?.google_service_account_key_json ?? env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON,
    scopes: row?.google_gmail_scopes ?? env.GOOGLE_GMAIL_SCOPES,
    query: row?.gmail_ingest_query ?? env.GMAIL_INGEST_QUERY,
    maxResults: row?.gmail_max_results ?? env.GMAIL_MAX_RESULTS,
    lookbackMs: row?.gmail_ingest_lookback_ms ?? env.GMAIL_INGEST_LOOKBACK_MS,
    processedLabel: row?.gmail_processed_label ?? env.GMAIL_PROCESSED_LABEL,
    storageDir: row?.gmail_storage_dir ?? env.GMAIL_STORAGE_DIR,
    attachmentPattern: row?.catalog_attachment_pattern ?? env.CATALOG_ATTACHMENT_PATTERN,
    supplierCode: row?.supplier_code ?? env.SUPPLIER_CODE,
  };
}

export function getMissingGmailIngestSettings(settings: GmailIngestSettings): string[] {
  return [
    requiredSetting("google_workspace_delegated_user", settings.delegatedUser),
    requiredSetting("google_service_account_key_json", settings.serviceAccountKeyJson),
    requiredSetting("gmail_ingest_query", settings.query),
    requiredSetting("catalog_attachment_pattern", settings.attachmentPattern),
    requiredSetting("gmail_storage_dir", settings.storageDir),
    requiredSetting("supplier_code", settings.supplierCode),
  ].filter((value): value is string => Boolean(value));
}

export function assertRunnableGmailIngestSettings(
  settings: GmailIngestSettings,
): asserts settings is RunnableGmailIngestSettings {
  const missing = getMissingGmailIngestSettings(settings);
  if (missing.length > 0) {
    throw new Error(`Gmail ingest settings are incomplete: ${missing.join(", ")}`);
  }
}

function requiredSetting(name: string, value: string | undefined): string | null {
  return value?.trim() ? null : name;
}
