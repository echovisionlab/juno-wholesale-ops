import type { RuntimeEnv } from "@/lib/env";
import type { JunoLiveServiceSettingsRow } from "@/lib/juno-live/settings";

export type SettingsGroupId = "system" | "auth" | "gmail" | "juno" | "notifications" | "advanced";
export type SettingValueType = "string" | "number" | "boolean" | "email" | "url" | "csv" | "secret";
export type SettingSource = "database" | "runtime" | "default" | "unset";
export type SettingState = "configured" | "missing" | "disabled" | "invalid";

export type ServiceSettingsRow = JunoLiveServiceSettingsRow & {
  updated_at?: string | Date | null;
};

export type ServiceSettingColumn = Exclude<keyof JunoLiveServiceSettingsRow, never>;

export type RuntimeEnvKey = keyof RuntimeEnv;

export type SettingDefinition = {
  key: string;
  group: SettingsGroupId;
  label: string;
  rowColumn?: ServiceSettingColumn;
  envKey?: RuntimeEnvKey;
  runtimeEnvKey?: string;
  required: boolean;
  secret: boolean;
  editable: boolean;
  type: SettingValueType;
  defaultValue?: string | number | boolean | null;
  help: string;
};

export type SettingDescriptor = {
  key: string;
  label: string;
  value: string | number | boolean | null;
  displayValue: string;
  source: SettingSource;
  state: SettingState;
  secret: boolean;
  editable: boolean;
  clearable: boolean;
  required: boolean;
  help: string;
  type: SettingValueType;
};

export type SettingsGroup = {
  id: SettingsGroupId;
  label: string;
  state: "complete" | "missing" | "warning" | "disabled";
  settings: SettingDescriptor[];
};

export type NextAction = {
  id: string;
  label: string;
  detail: string;
  href?: string;
  action?: string;
  severity: "info" | "warning" | "critical";
};

export type SettingsWarning = {
  id: string;
  severity: "info" | "warning" | "critical";
  message: string;
};

export type SettingsResponse = {
  environment: {
    nodeEnv: string;
    appBaseUrl: string | null;
    deploymentMode: "development" | "production" | "unknown";
    lastUpdatedAt: string | null;
    readOnlyBoundary: {
      noCart: true;
      noOrdering: true;
      noCheckout: true;
    };
  };
  groups: SettingsGroup[];
  nextActions: NextAction[];
  warnings: SettingsWarning[];
};

export type ServiceSettingsPatch = Partial<Record<ServiceSettingColumn, string | number | boolean | null>>;

export const serviceSettingColumns = [
  "juno_live_enqueue_on_ingest",
  "juno_login_email",
  "juno_login_password",
  "juno_browser_profile_dir",
  "juno_browser_headless",
  "juno_live_concurrency",
  "juno_live_delay_min_ms",
  "juno_live_delay_max_ms",
  "juno_live_nav_timeout_ms",
  "juno_live_max_attempts",
  "juno_live_poll_interval_ms",
  "juno_live_auto_enqueue_on_interval",
  "juno_live_auto_enqueue_limit",
  "gmail_ingest_lookback_ms",
  "google_workspace_delegated_user",
  "google_service_account_key_json",
  "google_gmail_scopes",
  "gmail_ingest_query",
  "gmail_max_results",
  "gmail_processed_label",
  "gmail_storage_dir",
  "catalog_attachment_pattern",
  "supplier_code",
  "auth_enabled",
  "auth_base_url",
  "auth_trusted_origins",
  "auth_email_password_enabled",
  "auth_external_provider_enabled",
  "auth_external_provider_id",
  "auth_external_provider_name",
  "auth_external_discovery_url",
  "auth_external_client_id",
  "auth_external_client_secret",
] as const satisfies readonly ServiceSettingColumn[];

const runtimeEnvKeyLookup = {
  DATABASE_URL: true,
  AUTH_ENABLED: true,
  AUTH_SECRET: true,
  AUTH_BASE_URL: true,
  AUTH_TRUSTED_ORIGINS: true,
  AUTH_EMAIL_PASSWORD_ENABLED: true,
  AUTH_EXTERNAL_PROVIDER_ENABLED: true,
  AUTH_EXTERNAL_PROVIDER_ID: true,
  AUTH_EXTERNAL_PROVIDER_NAME: true,
  AUTH_EXTERNAL_DISCOVERY_URL: true,
  AUTH_EXTERNAL_CLIENT_ID: true,
  AUTH_EXTERNAL_CLIENT_SECRET: true,
  AUTH_INITIAL_ADMIN_EMAIL: true,
  AUTH_INITIAL_ADMIN_PASSWORD: true,
  AUTH_INITIAL_ADMIN_NAME: true,
  GOOGLE_WORKSPACE_DELEGATED_USER: true,
  GOOGLE_SERVICE_ACCOUNT_KEY_JSON: true,
  GOOGLE_GMAIL_SCOPES: true,
  GMAIL_INGEST_QUERY: true,
  GMAIL_MAX_RESULTS: true,
  GMAIL_INGEST_LOOKBACK_MS: true,
  GMAIL_PROCESSED_LABEL: true,
  GMAIL_STORAGE_DIR: true,
  CATALOG_ATTACHMENT_PATTERN: true,
  SUPPLIER_CODE: true,
  JUNO_LIVE_ENQUEUE_ON_INGEST: true,
  JUNO_LOGIN_EMAIL: true,
  JUNO_LOGIN_PASSWORD: true,
  JUNO_BROWSER_PROFILE_DIR: true,
  JUNO_BROWSER_HEADLESS: true,
  JUNO_LIVE_CONCURRENCY: true,
  JUNO_LIVE_DELAY_MIN_MS: true,
  JUNO_LIVE_DELAY_MAX_MS: true,
  JUNO_LIVE_NAV_TIMEOUT_MS: true,
  JUNO_LIVE_MAX_ATTEMPTS: true,
  JUNO_LIVE_POLL_INTERVAL_MS: true,
  JUNO_LIVE_AUTO_ENQUEUE_ON_INTERVAL: true,
  JUNO_LIVE_AUTO_ENQUEUE_LIMIT: true,
  JUNO_LIVE_WORKER_COMMAND: true,
  JUNO_LIVE_WORKER_ARGS: true,
} satisfies Record<RuntimeEnvKey, true>;

export const settingDefinitions = [
  systemSetting("database_url", "Database URL", "DATABASE_URL", true, true, "Runtime-only Postgres connection."),
  systemSetting("auth_secret", "Auth secret", "AUTH_SECRET", true, true, "Runtime-only Better Auth signing secret."),
  systemSetting(
    "next_public_font_stylesheet_url",
    "Font stylesheet",
    "NEXT_PUBLIC_FONT_STYLESHEET_URL",
    false,
    false,
    "Optional runtime stylesheet URL for self-hosted deployments.",
  ),
  systemSetting(
    "juno_wholesale_ops_web_image",
    "Container image",
    "JUNO_WHOLESALE_OPS_WEB_IMAGE",
    false,
    false,
    "Optional runtime image reference used by local deployment helpers.",
  ),
  systemSetting(
    "juno_wholesale_ops_web_public_port",
    "Web public port",
    "JUNO_WHOLESALE_OPS_WEB_PUBLIC_PORT",
    false,
    false,
    "Runtime deployment port mapping. The dev server defaults to 3006.",
    "3006",
  ),
  dbSetting("auth", "auth_enabled", "AUTH_ENABLED", "Admin auth enabled", "boolean", false, false, "Enables admin login protection.", false),
  dbSetting("auth", "auth_base_url", "AUTH_BASE_URL", "Auth base URL", "url", true, false, "External URL used by Better Auth callbacks."),
  dbSetting("auth", "auth_trusted_origins", "AUTH_TRUSTED_ORIGINS", "Trusted origins", "csv", false, false, "Comma or newline separated origins that may use auth flows."),
  dbSetting("auth", "auth_email_password_enabled", "AUTH_EMAIL_PASSWORD_ENABLED", "Email/password login", "boolean", false, false, "Allows local admin email/password login.", true),
  dbSetting("auth", "auth_external_provider_enabled", "AUTH_EXTERNAL_PROVIDER_ENABLED", "External provider enabled", "boolean", false, false, "Allows a configured OIDC provider."),
  dbSetting("auth", "auth_external_provider_id", "AUTH_EXTERNAL_PROVIDER_ID", "External provider ID", "string", false, false, "Stable provider identifier."),
  dbSetting("auth", "auth_external_provider_name", "AUTH_EXTERNAL_PROVIDER_NAME", "External provider name", "string", false, false, "Operator-visible provider name."),
  dbSetting("auth", "auth_external_discovery_url", "AUTH_EXTERNAL_DISCOVERY_URL", "Discovery URL", "url", false, false, "OIDC discovery URL."),
  dbSetting("auth", "auth_external_client_id", "AUTH_EXTERNAL_CLIENT_ID", "External client ID", "string", false, false, "OIDC client ID."),
  dbSetting("auth", "auth_external_client_secret", "AUTH_EXTERNAL_CLIENT_SECRET", "External client secret", "secret", false, true, "OIDC client secret. Write-only."),
  dbSetting("gmail", "google_workspace_delegated_user", "GOOGLE_WORKSPACE_DELEGATED_USER", "Delegated mailbox", "email", true, false, "Mailbox used for read-only Gmail catalog search."),
  dbSetting("gmail", "google_service_account_key_json", "GOOGLE_SERVICE_ACCOUNT_KEY_JSON", "Service account key", "secret", true, true, "Service account JSON content or private runtime reference. Write-only."),
  dbSetting("gmail", "google_gmail_scopes", "GOOGLE_GMAIL_SCOPES", "Gmail scopes", "csv", false, false, "Gmail OAuth scopes. Read-only scope is recommended.", "https://www.googleapis.com/auth/gmail.readonly"),
  dbSetting("gmail", "gmail_ingest_query", "GMAIL_INGEST_QUERY", "Gmail query", "string", true, false, "Catalog mail search expression.", "has:attachment filename:xlsx newer_than:30d"),
  dbSetting("gmail", "gmail_max_results", "GMAIL_MAX_RESULTS", "Max messages", "number", false, false, "Maximum Gmail messages per ingest run.", 25),
  dbSetting("gmail", "gmail_ingest_lookback_ms", "GMAIL_INGEST_LOOKBACK_MS", "Lookback window", "number", false, false, "Fallback ingest lookback window in milliseconds.", 604800000),
  dbSetting("gmail", "gmail_processed_label", "GMAIL_PROCESSED_LABEL", "Processed label", "string", false, false, "Label used only when Gmail modify scope is intentionally configured.", "Wholesale Processed"),
  dbSetting("gmail", "gmail_storage_dir", "GMAIL_STORAGE_DIR", "Attachment storage", "string", true, false, "Local archive path for raw XLSX attachments.", ".data/mail-attachments"),
  dbSetting("gmail", "catalog_attachment_pattern", "CATALOG_ATTACHMENT_PATTERN", "Attachment pattern", "string", true, false, "Filename pattern for catalog workbooks.", "New Preorders|New Releases In Stock"),
  dbSetting("gmail", "supplier_code", "SUPPLIER_CODE", "Supplier code", "string", true, false, "Supplier code stored with catalog snapshots.", "juno"),
  dbSetting("juno", "juno_live_enqueue_on_ingest", "JUNO_LIVE_ENQUEUE_ON_INGEST", "Enqueue on ingest", "boolean", false, false, "Queues read-only live lookup jobs after new snapshots.", false),
  dbSetting("juno", "juno_login_email", "JUNO_LOGIN_EMAIL", "Juno login email", "email", true, false, "Login email used only for read-only product page observation."),
  dbSetting("juno", "juno_login_password", "JUNO_LOGIN_PASSWORD", "Juno login password", "secret", true, true, "Login password. Write-only."),
  dbSetting("juno", "juno_browser_profile_dir", "JUNO_BROWSER_PROFILE_DIR", "Browser profile dir", "string", false, false, "Persistent Playwright profile path.", ".data/juno-browser-profile"),
  dbSetting("juno", "juno_browser_headless", "JUNO_BROWSER_HEADLESS", "Headless browser", "boolean", false, false, "Runs Chromium headless when enabled.", true),
  dbSetting("juno", "juno_live_concurrency", "JUNO_LIVE_CONCURRENCY", "Concurrency", "number", false, false, "Maximum parallel read-only browser pages.", 1),
  dbSetting("juno", "juno_live_delay_min_ms", "JUNO_LIVE_DELAY_MIN_MS", "Delay min", "number", false, false, "Minimum randomized page delay in milliseconds.", 30000),
  dbSetting("juno", "juno_live_delay_max_ms", "JUNO_LIVE_DELAY_MAX_MS", "Delay max", "number", false, false, "Maximum randomized page delay in milliseconds.", 180000),
  dbSetting("juno", "juno_live_nav_timeout_ms", "JUNO_LIVE_NAV_TIMEOUT_MS", "Navigation timeout", "number", false, false, "Read-only page navigation timeout in milliseconds.", 45000),
  dbSetting("juno", "juno_live_max_attempts", "JUNO_LIVE_MAX_ATTEMPTS", "Max attempts", "number", false, false, "Maximum attempts for retryable live lookup jobs.", 2),
  dbSetting("juno", "juno_live_poll_interval_ms", "JUNO_LIVE_POLL_INTERVAL_MS", "Poll interval", "number", false, false, "Automatic polling interval. Leave unset for manual operation."),
  dbSetting("juno", "juno_live_auto_enqueue_on_interval", "JUNO_LIVE_AUTO_ENQUEUE_ON_INTERVAL", "Auto enqueue on interval", "boolean", false, false, "Allows automatic enqueue only when credentials and interval are configured.", false),
  dbSetting("juno", "juno_live_auto_enqueue_limit", "JUNO_LIVE_AUTO_ENQUEUE_LIMIT", "Auto enqueue limit", "number", false, false, "Maximum jobs queued by automatic interval.", 1000),
] as const satisfies readonly SettingDefinition[];

export const definitionsByKey = new Map(settingDefinitions.map((definition) => [definition.key, definition]));

function systemSetting(
  key: string,
  label: string,
  runtimeEnvKey: RuntimeEnvKey | string | undefined,
  required: boolean,
  secret: boolean,
  help: string,
  defaultValue?: string | number | boolean,
): SettingDefinition {
  return {
    key,
    group: "system",
    label,
    envKey: isRuntimeEnvKey(runtimeEnvKey) ? runtimeEnvKey : undefined,
    runtimeEnvKey,
    required,
    secret,
    editable: false,
    type: secret ? "secret" : "string",
    defaultValue,
    help,
  };
}

function dbSetting(
  group: SettingsGroupId,
  rowColumn: ServiceSettingColumn,
  envKey: RuntimeEnvKey,
  label: string,
  type: SettingValueType,
  required: boolean,
  secret: boolean,
  help: string,
  defaultValue?: string | number | boolean,
): SettingDefinition {
  return {
    key: rowColumn,
    group,
    label,
    rowColumn,
    envKey,
    runtimeEnvKey: envKey,
    required,
    secret,
    editable: true,
    type,
    defaultValue,
    help,
  };
}

function isRuntimeEnvKey(value: RuntimeEnvKey | string | undefined): value is RuntimeEnvKey {
  return typeof value === "string" && value in runtimeEnvKeyLookup;
}
