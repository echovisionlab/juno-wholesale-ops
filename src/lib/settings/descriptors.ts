import type { RuntimeEnv } from "@/lib/env";
import type { JunoLiveServiceSettingsRow } from "@/lib/juno-live/settings";

import type { PublicMailboxSource } from "@/lib/ingest/mail-source";

export type SettingsGroupId = "system" | "auth" | "mail" | "juno" | "notifications" | "advanced";
export type SettingValueType = "string" | "number" | "boolean" | "email" | "url" | "csv" | "secret" | "select";
export type SettingSource = "database" | "runtime" | "default" | "unset";
export type SettingState = "configured" | "missing" | "disabled" | "invalid";
export type DataMode = "demo" | "real_mailbox";
export type SettingRequiredWhen =
  | "always"
  | "real_mailbox"
  | "external_provider_enabled"
  | "juno_lookup_enabled";
export type SettingUnit =
  | "system_runtime"
  | "auth_provider"
  | "mail_source"
  | "juno_live_lookup"
  | "notification_delivery";

export type ServiceSettingsRow = JunoLiveServiceSettingsRow & {
  updated_at?: string | Date | null;
};

export type ServiceSettingColumn = Exclude<keyof JunoLiveServiceSettingsRow, never>;

export type RuntimeEnvKey = keyof RuntimeEnv;

export type SettingOption = {
  value: string;
  label: string;
};

export type SettingDefinition = {
  key: string;
  group: SettingsGroupId;
  label: string;
  rowColumn?: ServiceSettingColumn;
  envKey?: RuntimeEnvKey;
  runtimeEnvKey?: string;
  required: boolean;
  requiredWhen?: SettingRequiredWhen;
  secret: boolean;
  editable: boolean;
  runtimeOnly?: boolean;
  advanced?: boolean;
  unit?: SettingUnit;
  type: SettingValueType;
  options?: SettingOption[];
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
  requiredWhen?: SettingRequiredWhen;
  runtimeOnly: boolean;
  advanced: boolean;
  unit?: SettingUnit;
  help: string;
  type: SettingValueType;
  options?: SettingOption[];
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

export type IntegrationUnitStatus = "ready" | "missing" | "invalid" | "disabled" | "warning" | "blocked";

export type IntegrationUnit = {
  id: "mail_sources" | "juno_live" | "notifications";
  label: string;
  status: IntegrationUnitStatus;
  detail: string;
  configured: boolean;
  optional: boolean;
};

export type AuthProviderUnit = {
  id: "auth_provider";
  label: string;
  providerType: "generic_oauth_oidc";
  enabled: boolean;
  status: IntegrationUnitStatus;
  displayName: string;
  buttonLabel: string;
  providerId: string | null;
  logoUrl: string | null;
  discoveryUrl: string | null;
  clientId: string | null;
  clientSecretConfigured: boolean;
  scopes: string[];
  callbackUrl: string | null;
  adminEmailAllowlistConfigured: boolean;
  adminClaimMappingConfigured: boolean;
  detail: string;
};

export type AuthBootstrapStatus = {
  status: "ready" | "blocked" | "warning";
  adminUserCount: number | null;
  hasInitialAdminEnv: boolean;
  hasExternalAdminMapping: boolean;
  detail: string;
};

export type SettingsResponse = {
  environment: {
    nodeEnv: string;
    appBaseUrl: string | null;
    currentRequestOrigin: string | null;
    deploymentMode: "development" | "production" | "unknown";
    lastUpdatedAt: string | null;
    readOnlyBoundary: {
      noCart: true;
      noOrdering: true;
      noCheckout: true;
    };
  };
  dataMode: {
    value: DataMode;
    source: SettingSource;
    status: "demo" | "real_mailbox";
    detail: string;
  };
  units: {
    authProvider: AuthProviderUnit;
    mail: IntegrationUnit;
    junoLive: IntegrationUnit;
    notifications: IntegrationUnit;
  };
  security: {
    authBootstrap: AuthBootstrapStatus;
  };
  mailSources: PublicMailboxSource[];
  groups: SettingsGroup[];
  nextActions: NextAction[];
  warnings: SettingsWarning[];
};

export type ServiceSettingsPatch = Partial<Record<ServiceSettingColumn, string | number | boolean | null>>;

export const serviceSettingColumns = [
  "data_mode",
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
  "auth_secret",
  "auth_base_url",
  "auth_trusted_origins",
  "auth_external_provider_enabled",
  "auth_external_provider_id",
  "auth_external_provider_name",
  "auth_login_logo_url",
  "auth_external_provider_logo_url",
  "auth_external_provider_button_label",
  "auth_external_discovery_url",
  "auth_external_client_id",
  "auth_external_client_secret",
  "auth_external_provider_scopes",
  "auth_admin_email_allowlist",
  "auth_external_admin_claim",
  "auth_external_admin_claim_value",
] as const satisfies readonly ServiceSettingColumn[];

const runtimeEnvKeyLookup = {
  DATABASE_URL: true,
  JUNO_WHOLESALE_OPS_DATA_MODE: true,
  AUTH_SECRET: true,
  AUTH_BASE_URL: true,
  AUTH_TRUSTED_ORIGINS: true,
  AUTH_EXTERNAL_PROVIDER_ENABLED: true,
  AUTH_EXTERNAL_PROVIDER_ID: true,
  AUTH_EXTERNAL_PROVIDER_NAME: true,
  AUTH_EXTERNAL_PROVIDER_LOGO_URL: true,
  AUTH_EXTERNAL_PROVIDER_BUTTON_LABEL: true,
  AUTH_EXTERNAL_DISCOVERY_URL: true,
  AUTH_EXTERNAL_CLIENT_ID: true,
  AUTH_EXTERNAL_CLIENT_SECRET: true,
  AUTH_EXTERNAL_PROVIDER_SCOPES: true,
  AUTH_ADMIN_EMAIL_ALLOWLIST: true,
  AUTH_EXTERNAL_ADMIN_CLAIM: true,
  AUTH_EXTERNAL_ADMIN_CLAIM_VALUE: true,
  AUTH_INITIAL_ADMIN_EMAIL: true,
  AUTH_INITIAL_ADMIN_PASSWORD: true,
  AUTH_INITIAL_ADMIN_NAME: true,
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
  systemSetting("database_url", "Database URL", "DATABASE_URL", "always", true, "Runtime-only Postgres connection."),
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
  systemSetting(
    "juno_live_worker_command",
    "Worker command",
    "JUNO_LIVE_WORKER_COMMAND",
    false,
    false,
    "Advanced runtime-only command override for the read-only live lookup worker.",
    undefined,
    true,
  ),
  systemSetting(
    "juno_live_worker_args",
    "Worker args",
    "JUNO_LIVE_WORKER_ARGS",
    false,
    false,
    "Advanced runtime-only worker argument override.",
    undefined,
    true,
  ),
  dbSetting("system", "data_mode", "JUNO_WHOLESALE_OPS_DATA_MODE", "Data mode", "select", false, false, "Demo mode uses synthetic data and does not require mail sources; real mailbox mode requires at least one runnable mail source.", "demo", {
    options: [
      { value: "demo", label: "Demo" },
      { value: "real_mailbox", label: "Real mailbox" },
    ],
  }),
  dbSetting("auth", "auth_base_url", "AUTH_BASE_URL", "Site address", "url", true, false, "Current public site URL. Better Auth callbacks are derived from this saved setting; runtime/current origin is only a bootstrap fallback.", undefined, { requiredWhen: "always" }),
  dbSetting("auth", "auth_trusted_origins", "AUTH_TRUSTED_ORIGINS", "Trusted origins", "csv", false, false, "Comma or newline separated origins that may use auth flows."),
  dbSetting("auth", "auth_external_provider_enabled", "AUTH_EXTERNAL_PROVIDER_ENABLED", "External provider enabled", "boolean", false, false, "Allows a configured Generic OAuth/OIDC provider."),
  dbSetting("auth", "auth_external_provider_id", "AUTH_EXTERNAL_PROVIDER_ID", "Provider ID", "string", false, false, "Stable provider identifier used in /api/auth/oauth2/callback/<provider-id>.", undefined, { requiredWhen: "external_provider_enabled", unit: "auth_provider" }),
  dbSetting("auth", "auth_external_provider_name", "AUTH_EXTERNAL_PROVIDER_NAME", "Provider display name", "string", false, false, "Operator-visible provider name.", undefined, { unit: "auth_provider" }),
  dbOnlySetting("auth", "auth_login_logo_url", "Login logo URL", "url", false, false, "Optional png, webp, or svg logo shown above the sign-in form."),
  dbSetting("auth", "auth_external_provider_button_label", "AUTH_EXTERNAL_PROVIDER_BUTTON_LABEL", "Provider button label", "string", false, false, "Optional sign-in button label shown to operators.", undefined, { unit: "auth_provider" }),
  dbSetting("auth", "auth_external_provider_logo_url", "AUTH_EXTERNAL_PROVIDER_LOGO_URL", "Provider logo URL", "url", false, false, "Optional logo URL for the auth provider.", undefined, { unit: "auth_provider" }),
  dbSetting("auth", "auth_external_discovery_url", "AUTH_EXTERNAL_DISCOVERY_URL", "Discovery URL", "url", false, false, "OIDC discovery URL.", undefined, { requiredWhen: "external_provider_enabled", unit: "auth_provider" }),
  dbSetting("auth", "auth_external_client_id", "AUTH_EXTERNAL_CLIENT_ID", "External client ID", "string", false, false, "OIDC client ID.", undefined, { requiredWhen: "external_provider_enabled", unit: "auth_provider" }),
  dbSetting("auth", "auth_external_client_secret", "AUTH_EXTERNAL_CLIENT_SECRET", "External client secret", "secret", false, true, "OIDC client secret. Write-only.", undefined, { requiredWhen: "external_provider_enabled", unit: "auth_provider" }),
  dbSetting("auth", "auth_external_provider_scopes", "AUTH_EXTERNAL_PROVIDER_SCOPES", "Provider scopes", "csv", false, false, "OAuth/OIDC scopes requested from the provider.", "openid email profile", { unit: "auth_provider" }),
  dbSetting("auth", "auth_admin_email_allowlist", "AUTH_ADMIN_EMAIL_ALLOWLIST", "Admin email allowlist", "csv", false, false, "Optional admin bootstrap allowlist for external provider accounts. Values are masked in security status as configured/not configured.", undefined, { unit: "auth_provider" }),
  dbSetting("auth", "auth_external_admin_claim", "AUTH_EXTERNAL_ADMIN_CLAIM", "Admin claim", "string", false, false, "Optional external provider claim name used for admin bootstrap policy.", undefined, { unit: "auth_provider" }),
  dbSetting("auth", "auth_external_admin_claim_value", "AUTH_EXTERNAL_ADMIN_CLAIM_VALUE", "Admin claim value", "string", false, false, "Optional external provider claim value used for admin bootstrap policy.", undefined, { unit: "auth_provider" }),
  dbSetting("juno", "juno_live_enqueue_on_ingest", "JUNO_LIVE_ENQUEUE_ON_INGEST", "Enqueue on ingest", "boolean", false, false, "Queues read-only live lookup jobs after new snapshots.", false, { unit: "juno_live_lookup" }),
  dbSetting("juno", "juno_login_email", "JUNO_LOGIN_EMAIL", "Juno login email", "email", true, false, "Login email used only for read-only product page observation. Required only when live lookup is enabled.", undefined, { requiredWhen: "juno_lookup_enabled", unit: "juno_live_lookup" }),
  dbSetting("juno", "juno_login_password", "JUNO_LOGIN_PASSWORD", "Juno login password", "secret", true, true, "Login password. Write-only and required only when live lookup is enabled.", undefined, { requiredWhen: "juno_lookup_enabled", unit: "juno_live_lookup" }),
  dbSetting("juno", "juno_browser_profile_dir", "JUNO_BROWSER_PROFILE_DIR", "Browser profile dir", "string", false, false, "Persistent Playwright profile path.", ".data/juno-browser-profile", { unit: "juno_live_lookup" }),
  dbSetting("juno", "juno_browser_headless", "JUNO_BROWSER_HEADLESS", "Headless browser", "boolean", false, false, "Runs Chromium headless when enabled.", true, { unit: "juno_live_lookup" }),
  dbSetting("juno", "juno_live_concurrency", "JUNO_LIVE_CONCURRENCY", "Concurrency", "number", false, false, "Maximum parallel read-only browser pages.", 1, { unit: "juno_live_lookup" }),
  dbSetting("juno", "juno_live_delay_min_ms", "JUNO_LIVE_DELAY_MIN_MS", "Delay min", "number", false, false, "Minimum randomized page delay in milliseconds.", 30000, { unit: "juno_live_lookup" }),
  dbSetting("juno", "juno_live_delay_max_ms", "JUNO_LIVE_DELAY_MAX_MS", "Delay max", "number", false, false, "Maximum randomized page delay in milliseconds.", 180000, { unit: "juno_live_lookup" }),
  dbSetting("juno", "juno_live_nav_timeout_ms", "JUNO_LIVE_NAV_TIMEOUT_MS", "Navigation timeout", "number", false, false, "Read-only page navigation timeout in milliseconds.", 45000, { advanced: true, unit: "juno_live_lookup" }),
  dbSetting("juno", "juno_live_max_attempts", "JUNO_LIVE_MAX_ATTEMPTS", "Max attempts", "number", false, false, "Maximum attempts for retryable live lookup jobs.", 2, { unit: "juno_live_lookup" }),
  dbSetting("juno", "juno_live_poll_interval_ms", "JUNO_LIVE_POLL_INTERVAL_MS", "Poll interval", "number", false, false, "Automatic polling interval. Leave unset for manual operation.", undefined, { unit: "juno_live_lookup" }),
  dbSetting("juno", "juno_live_auto_enqueue_on_interval", "JUNO_LIVE_AUTO_ENQUEUE_ON_INTERVAL", "Auto enqueue on interval", "boolean", false, false, "Allows automatic enqueue only when credentials and interval are configured.", false, { unit: "juno_live_lookup" }),
  dbSetting("juno", "juno_live_auto_enqueue_limit", "JUNO_LIVE_AUTO_ENQUEUE_LIMIT", "Auto enqueue limit", "number", false, false, "Maximum jobs queued by automatic interval.", 1000, { advanced: true, unit: "juno_live_lookup" }),
] as const satisfies readonly SettingDefinition[];

export const definitionsByKey = new Map(settingDefinitions.map((definition) => [definition.key, definition]));

function systemSetting(
  key: string,
  label: string,
  runtimeEnvKey: RuntimeEnvKey | string | undefined,
  required: boolean | SettingRequiredWhen,
  secret: boolean,
  help: string,
  defaultValue?: string | number | boolean,
  advanced = false,
): SettingDefinition {
  return {
    key,
    group: "system",
    label,
    envKey: isRuntimeEnvKey(runtimeEnvKey) ? runtimeEnvKey : undefined,
    runtimeEnvKey,
    required: required === true || required === "always",
    requiredWhen: typeof required === "string" ? required : undefined,
    secret,
    editable: false,
    runtimeOnly: true,
    advanced,
    unit: "system_runtime",
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
  options: {
    requiredWhen?: SettingRequiredWhen;
    advanced?: boolean;
    unit?: SettingUnit;
    options?: SettingOption[];
  } = {},
): SettingDefinition {
  return {
    key: rowColumn,
    group,
    label,
    rowColumn,
    envKey,
    runtimeEnvKey: envKey,
    required,
    requiredWhen: options.requiredWhen,
    secret,
    editable: true,
    runtimeOnly: false,
    advanced: options.advanced ?? false,
    unit: options.unit,
    type,
    options: options.options,
    defaultValue,
    help,
  };
}

function dbOnlySetting(
  group: SettingsGroupId,
  rowColumn: ServiceSettingColumn,
  label: string,
  type: SettingValueType,
  required: boolean,
  secret: boolean,
  help: string,
  defaultValue?: string | number | boolean,
  options: {
    requiredWhen?: SettingRequiredWhen;
    advanced?: boolean;
    unit?: SettingUnit;
    options?: SettingOption[];
  } = {},
): SettingDefinition {
  return {
    key: rowColumn,
    group,
    label,
    rowColumn,
    required,
    requiredWhen: options.requiredWhen,
    secret,
    editable: true,
    runtimeOnly: false,
    advanced: options.advanced ?? false,
    unit: options.unit,
    type,
    options: options.options,
    defaultValue,
    help,
  };
}

function isRuntimeEnvKey(value: RuntimeEnvKey | string | undefined): value is RuntimeEnvKey {
  return typeof value === "string" && value in runtimeEnvKeyLookup;
}
