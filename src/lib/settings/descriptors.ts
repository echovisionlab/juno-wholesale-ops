import type { JunoLiveServiceSettingsRow } from "@/lib/juno-live/settings";

import type { PublicMailboxSource } from "@/lib/ingest/mail-source";

export type SettingsGroupId = "auth" | "mail" | "juno" | "notifications";
export type SettingValueType = "string" | "number" | "boolean" | "email" | "url" | "csv" | "secret" | "select";
export type SettingSource = "database" | "runtime" | "default" | "unset";
export type SettingState = "configured" | "missing" | "disabled" | "invalid";
export type SettingRequiredWhen =
  | "always"
  | "juno_lookup_enabled";
export type SettingUnit =
  | "auth_provider"
  | "mail_source"
  | "juno_live_lookup"
  | "notification_delivery";

export type ServiceSettingsRow = JunoLiveServiceSettingsRow & {
  updated_at?: string | Date | null;
};

export type ServiceSettingColumn = Exclude<keyof JunoLiveServiceSettingsRow, never>;

export type SettingOption = {
  value: string;
  label: string;
};

export type SettingDefinition = {
  key: string;
  group: SettingsGroupId;
  label: string;
  rowColumn?: ServiceSettingColumn;
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
  status: IntegrationUnitStatus;
  providerCount: number;
  enabledProviderCount: number;
  readyProviderCount: number;
  providers: SsoProviderUnit[];
  detail: string;
};

export type SsoProviderUnit = {
  id: string;
  providerId: string;
  displayName: string;
  buttonLabel: string;
  logoUrl: string | null;
  protocol: "oidc" | "oauth2";
  preset: string;
  enabled: boolean;
  status: IntegrationUnitStatus;
  discoveryUrl: string | null;
  authorizationUrl: string | null;
  tokenUrl: string | null;
  userInfoUrl: string | null;
  clientId: string | null;
  clientSecretRef: string | null;
  clientSecretConfigured: boolean;
  scopes: string[];
  callbackUrl: string | null;
  adminEmailAllowlist: string[];
  adminClaim: string | null;
  adminClaimValue: string | null;
  sortOrder: number;
  missing: string[];
  invalid: string[];
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
  "auth_secret",
  "auth_base_url",
  "auth_trusted_origins",
  "auth_email_password_login_enabled",
  "auth_login_logo_url",
] as const satisfies readonly ServiceSettingColumn[];

export const settingDefinitions = [
  dbSetting("auth", "auth_base_url", "Site address", "url", true, false, "Public app URL used for auth callbacks.", undefined, { requiredWhen: "always" }),
  dbSetting("auth", "auth_trusted_origins", "Trusted origins", "csv", false, false, "Allowed origins for auth flows."),
  dbOnlySetting("auth", "auth_email_password_login_enabled", "Email/password login", "boolean", false, false, "Allows local email/password sign-in. Disable only after at least one SSO provider is ready.", true),
  dbOnlySetting("auth", "auth_login_logo_url", "Login logo URL", "url", false, false, "Optional png, webp, or svg logo shown above the sign-in form."),
  dbSetting("juno", "juno_live_enqueue_on_ingest", "Enqueue on ingest", "boolean", false, false, "Queues read-only live lookup jobs after new snapshots.", false, { unit: "juno_live_lookup" }),
  dbSetting("juno", "juno_login_email", "Juno login email", "email", true, false, "Login email for read-only product page observation.", undefined, { requiredWhen: "juno_lookup_enabled", unit: "juno_live_lookup" }),
  dbSetting("juno", "juno_login_password", "Juno login password", "secret", true, true, "Write-only password for read-only product page observation.", undefined, { requiredWhen: "juno_lookup_enabled", unit: "juno_live_lookup" }),
  dbSetting("juno", "juno_browser_profile_dir", "Browser profile dir", "string", false, false, "Persistent Playwright profile path.", ".data/juno-browser-profile", { advanced: true, unit: "juno_live_lookup" }),
  dbSetting("juno", "juno_browser_headless", "Headless browser", "boolean", false, false, "Runs Chromium headless when enabled.", true, { advanced: true, unit: "juno_live_lookup" }),
  dbSetting("juno", "juno_live_concurrency", "Concurrency", "number", false, false, "Maximum parallel read-only browser pages.", 1, { unit: "juno_live_lookup" }),
  dbSetting("juno", "juno_live_delay_min_ms", "Delay min", "number", false, false, "Minimum randomized page delay in milliseconds.", 30000, { unit: "juno_live_lookup" }),
  dbSetting("juno", "juno_live_delay_max_ms", "Delay max", "number", false, false, "Maximum randomized page delay in milliseconds.", 180000, { unit: "juno_live_lookup" }),
  dbSetting("juno", "juno_live_nav_timeout_ms", "Navigation timeout", "number", false, false, "Read-only page navigation timeout in milliseconds.", 45000, { advanced: true, unit: "juno_live_lookup" }),
  dbSetting("juno", "juno_live_max_attempts", "Max attempts", "number", false, false, "Maximum attempts for retryable live lookup jobs.", 2, { advanced: true, unit: "juno_live_lookup" }),
  dbSetting("juno", "juno_live_poll_interval_ms", "Poll interval", "number", false, false, "Automatic polling interval. Leave unset for manual operation.", undefined, { unit: "juno_live_lookup" }),
  dbSetting("juno", "juno_live_auto_enqueue_on_interval", "Auto enqueue on interval", "boolean", false, false, "Allows automatic enqueue only when credentials and interval are configured.", false, { unit: "juno_live_lookup" }),
  dbSetting("juno", "juno_live_auto_enqueue_limit", "Auto enqueue limit", "number", false, false, "Maximum jobs queued by automatic interval.", 1000, { advanced: true, unit: "juno_live_lookup" }),
] as const satisfies readonly SettingDefinition[];

export const definitionsByKey = new Map(settingDefinitions.map((definition) => [definition.key, definition]));

function dbSetting(
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
