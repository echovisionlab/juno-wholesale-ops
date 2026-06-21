import type { SettingsResponse, SettingDescriptor } from "@/lib/settings/descriptors";
import type { NotificationChannel, NotificationRule } from "@/lib/notifications/types";

export function settingsFixture(): SettingsResponse {
  return {
    environment: {
      nodeEnv: "development",
      appBaseUrl: "https://inventory-dev.example.test",
      currentRequestOrigin: "https://inventory-dev.example.test",
      deploymentMode: "development",
      lastUpdatedAt: "2026-06-18T00:00:00.000Z",
      readOnlyBoundary: { noCart: true, noOrdering: true, noCheckout: true },
    },
    units: {
      authProvider: {
        id: "auth_provider",
        label: "Auth SSO Providers",
        status: "ready",
        providerCount: 1,
        enabledProviderCount: 1,
        readyProviderCount: 1,
        detail: "1 SSO provider ready for the Sign in page.",
        providers: [
          {
            id: "provider-1",
            providerId: "workspace",
            displayName: "Workspace",
            buttonLabel: "Continue with Workspace",
            logoUrl: null,
            protocol: "oidc",
            preset: "custom_oidc",
            enabled: true,
            status: "ready",
            discoveryUrl: "https://login.example.test/.well-known/openid-configuration",
            authorizationUrl: null,
            tokenUrl: null,
            userInfoUrl: null,
            clientId: "client-id",
            clientSecretRef: "env:WORKSPACE_CLIENT_SECRET",
            clientSecretConfigured: true,
            scopes: ["openid", "email", "profile"],
            callbackUrl: "https://inventory-dev.example.test/api/auth/oauth2/callback/workspace",
            adminEmailAllowlist: ["admin@example.test"],
            adminClaim: null,
            adminClaimValue: null,
            sortOrder: 0,
            missing: [],
            invalid: [],
          },
        ],
      },
      mail: {
        id: "mail_sources",
        label: "Mail sources",
        status: "ready",
        detail: "1 runnable mail source configured.",
        configured: true,
        optional: false,
      },
      junoLive: {
        id: "juno_live",
        label: "Read-only live lookup",
        status: "missing",
        detail: "Worker start is blocked until read-only login credentials and safe pacing are configured.",
        configured: false,
        optional: true,
      },
      notifications: {
        id: "notifications",
        label: "Notification delivery",
        status: "ready",
        detail: "In-app notifications are available. External webhook delivery remains opt-in.",
        configured: true,
        optional: true,
      },
    },
    security: {
      authBootstrap: {
        status: "ready",
        adminUserCount: 1,
        hasInitialAdminEnv: false,
        hasExternalAdminMapping: true,
        detail: "At least one admin user exists.",
      },
    },
    warnings: [],
    mailSources: [
      {
        id: "source-1",
        connectionId: "connection-1",
        name: "Gmail source",
        provider: "gmail",
        authType: "google_workspace_delegation",
        credentialType: "google_service_account_json",
        credentialReference: null,
        credentialConfigured: true,
        scopes: "https://www.googleapis.com/auth/gmail.readonly",
        mailboxAddress: "operator@example.test",
        displayName: "Operator",
        query: "filename:xlsx",
        maxResults: 25,
        lookbackMs: 604800000,
        processedLabel: "Processed",
        storageBackend: "local_drive",
        storageDir: ".data/mail",
        storageEndpoint: "",
        storageBucket: "",
        storagePrefix: "mail-attachments",
        storageRegion: "us-east-1",
        storageAccessKeyId: "",
        storageSecretConfigured: false,
        storageForcePathStyle: true,
        attachmentPattern: "xlsx",
        supplierCode: "juno",
        isActive: true,
      },
    ],
    groups: [
      {
        id: "auth",
        label: "Auth",
        state: "complete",
        settings: [
          setting("auth_base_url", "Site address", "database", "configured", "https://inventory-dev.example.test", false, true, "url"),
          setting("auth_email_password_login_enabled", "Email/password login", "database", "configured", "On", false, true, "boolean"),
          setting("auth_login_logo_url", "Login logo URL", "unset", "disabled", "Not set", false, true, "url"),
        ],
      },
      {
        id: "mail",
        label: "Mail Sources",
        state: "complete",
        settings: [],
      },
      {
        id: "juno",
        label: "Juno Live",
        state: "missing",
        settings: [
          setting("juno_login_email", "Juno login email", "unset", "missing", "Not configured", false, true, "email"),
          setting("juno_login_password", "Juno login password", "database", "configured", "Saved", true, true),
        ],
      },
      { id: "notifications", label: "Notifications", state: "complete", settings: [] },
    ],
  };
}

export function settingsMissingMailSourceFixture(): SettingsResponse {
  const settings = settingsFixture();
  return {
    ...settings,
    units: {
      ...settings.units,
      mail: {
        ...settings.units.mail,
        status: "missing",
        detail: "At least one active mailbox source is required.",
        configured: false,
      },
    },
    mailSources: [],
    groups: settings.groups.map((group) =>
      group.id === "mail" ? { ...group, state: "missing" } : group,
    ),
  };
}

export function settingsInvalidSsoFixture(): SettingsResponse {
  const settings = settingsFixture();
  return {
    ...settings,
    units: {
      ...settings.units,
      authProvider: {
        ...settings.units.authProvider,
        status: "warning",
        enabledProviderCount: 1,
        readyProviderCount: 0,
        detail: "1 SSO provider needs attention.",
        providers: settings.units.authProvider.providers.map((provider) => ({
          ...provider,
          status: "missing",
          clientSecretRef: null,
          clientSecretConfigured: false,
          missing: ["client secret"],
        })),
      },
    },
    groups: settings.groups.map((group) =>
      group.id === "auth" ? { ...group, state: "warning" } : group,
    ),
    warnings: [
      {
        id: "sso_provider_not_ready",
        severity: "warning",
        message: "External SSO provider is enabled but not ready.",
      },
    ],
  };
}

export function settingsNoSsoProvidersFixture(): SettingsResponse {
  const settings = settingsFixture();
  return {
    ...settings,
    units: {
      ...settings.units,
      authProvider: {
        ...settings.units.authProvider,
        status: "missing",
        providerCount: 0,
        enabledProviderCount: 0,
        readyProviderCount: 0,
        detail: "No external SSO providers are configured.",
        providers: [],
      },
    },
    groups: settings.groups.map((group) =>
      group.id === "auth" ? { ...group, state: "warning" } : group,
    ),
  };
}

export function settingsSsoProviderListFixture(): SettingsResponse {
  const settings = settingsFixture();
  const primaryProvider = settings.units.authProvider.providers[0];
  const disabledProvider = {
    ...primaryProvider,
    id: "provider-disabled",
    providerId: "analytics",
    displayName: "Analytics Workspace",
    buttonLabel: "Continue with Analytics",
    preset: "microsoft_entra_oidc",
    enabled: false,
    status: "disabled" as const,
    discoveryUrl: "https://login.example.test/analytics/.well-known/openid-configuration",
    clientId: "analytics-client-id",
    clientSecretRef: "env:ANALYTICS_CLIENT_SECRET",
    clientSecretConfigured: true,
    callbackUrl: "https://inventory-dev.example.test/api/auth/oauth2/callback/analytics",
    adminEmailAllowlist: [],
    adminClaim: "groups",
    adminClaimValue: "ops-admins",
    sortOrder: 1,
  };
  return {
    ...settings,
    units: {
      ...settings.units,
      authProvider: {
        ...settings.units.authProvider,
        providerCount: 2,
        enabledProviderCount: 1,
        readyProviderCount: 1,
        detail: "1 SSO provider ready and 1 disabled provider available.",
        providers: [primaryProvider, disabledProvider],
      },
    },
  };
}

export function settingsMailPlannedProviderFixture(): SettingsResponse {
  const settings = settingsFixture();
  return {
    ...settings,
    units: {
      ...settings.units,
      mail: {
        ...settings.units.mail,
        status: "warning",
        detail: "1 runnable Gmail source configured. Microsoft Graph is present as a planned adapter.",
      },
    },
    mailSources: [
      ...settings.mailSources,
      {
        id: "source-planned",
        connectionId: "connection-planned",
        name: "Microsoft Graph pilot",
        provider: "microsoft_graph",
        authType: "oauth2",
        credentialType: "oauth_client_secret",
        credentialReference: null,
        credentialConfigured: false,
        scopes: "Mail.Read",
        mailboxAddress: "catalog-pilot@example.test",
        displayName: "Catalog pilot",
        query: "hasAttachments eq true",
        maxResults: 25,
        lookbackMs: 604800000,
        processedLabel: "Processed",
        storageBackend: "local_drive",
        storageDir: ".data/mail",
        storageEndpoint: "",
        storageBucket: "",
        storagePrefix: "mail-attachments",
        storageRegion: "us-east-1",
        storageAccessKeyId: "",
        storageSecretConfigured: false,
        storageForcePathStyle: true,
        attachmentPattern: "xlsx",
        supplierCode: "juno",
        isActive: false,
      },
    ],
  };
}

export function settingsJunoLiveReadyFixture(): SettingsResponse {
  const settings = settingsFixture();
  return {
    ...settings,
    units: {
      ...settings.units,
      junoLive: {
        ...settings.units.junoLive,
        status: "ready",
        detail: "Read-only live lookup can be tested and started with safe pacing.",
        configured: true,
      },
    },
    groups: settings.groups.map((group) =>
      group.id === "juno"
        ? {
            ...group,
            state: "complete",
            settings: junoLiveReadySettings(),
          }
        : group,
    ),
  };
}

export function settingsJunoLiveWarningFixture(): SettingsResponse {
  const settings = settingsJunoLiveReadyFixture();
  return {
    ...settings,
    units: {
      ...settings.units,
      junoLive: {
        ...settings.units.junoLive,
        status: "warning",
        detail: "Review pacing before enabling automatic read-only lookup.",
      },
    },
    groups: settings.groups.map((group) =>
      group.id === "juno"
        ? {
            ...group,
            state: "warning",
            settings: junoLiveReadySettings({
              delayMinState: "invalid",
              delayMinDisplay: "180000",
              delayMaxDisplay: "30000",
              pollIntervalDisplay: "manual only",
              autoEnqueue: false,
            }),
          }
        : group,
    ),
    warnings: [
      ...settings.warnings,
      {
        id: "juno_live_delay_bounds",
        severity: "warning",
        message: "Delay min must be less than or equal to delay max.",
      },
    ],
  };
}

export function notificationChannelFixture(): NotificationChannel {
  return {
    id: "channel-1",
    name: "In-app",
    type: "in_app",
    enabled: true,
    config: {},
    secretRef: null,
    configSummary: "Dashboard-only read-only alerts",
    createdAt: "2026-06-18T00:00:00.000Z",
    updatedAt: "2026-06-18T00:00:00.000Z",
  };
}

export function notificationWebhookChannelFixture(): NotificationChannel {
  return {
    id: "channel-webhook",
    name: "Ops webhook",
    type: "webhook",
    enabled: true,
    config: { format: "slack", configured: true },
    secretRef: "OPS_WEBHOOK_URL",
    configSummary: "Slack-style webhook URL stored in OPS_WEBHOOK_URL",
    createdAt: "2026-06-18T00:00:00.000Z",
    updatedAt: "2026-06-18T00:00:00.000Z",
  };
}

export function notificationDisabledChannelFixture(): NotificationChannel {
  return {
    id: "channel-disabled",
    name: "Audit log",
    type: "logging",
    enabled: false,
    config: {},
    secretRef: null,
    configSummary: "Logging channel paused for operator review",
    createdAt: "2026-06-18T00:00:00.000Z",
    updatedAt: "2026-06-18T00:00:00.000Z",
  };
}

export function notificationRuleFixture(): NotificationRule {
  return {
    id: "rule-1",
    name: "Watch hits",
    channelId: "channel-1",
    channelName: "In-app",
    channelType: "in_app",
    channelEnabled: true,
    enabled: true,
    signalTypes: ["watch_hit"],
    severities: ["watch"],
    minScore: 10,
    includeWatchHits: true,
    includeDigest: false,
    cooldownMinutes: 60,
    createdAt: "2026-06-18T00:00:00.000Z",
    updatedAt: "2026-06-18T00:00:00.000Z",
  };
}

export function notificationDigestRuleFixture(): NotificationRule {
  return {
    id: "rule-digest",
    name: "Daily operator digest",
    channelId: "channel-webhook",
    channelName: "Ops webhook",
    channelType: "webhook",
    channelEnabled: true,
    enabled: true,
    signalTypes: [],
    severities: [],
    minScore: 0,
    includeWatchHits: true,
    includeDigest: true,
    cooldownMinutes: 1440,
    createdAt: "2026-06-18T00:00:00.000Z",
    updatedAt: "2026-06-18T00:00:00.000Z",
  };
}

export function notificationMutedRuleFixture(): NotificationRule {
  return {
    id: "rule-muted",
    name: "Paused low stock review",
    channelId: "channel-disabled",
    channelName: "Audit log",
    channelType: "logging",
    channelEnabled: false,
    enabled: false,
    signalTypes: ["low_catalog_stock", "observed_live_low_stock"],
    severities: ["warning", "critical"],
    minScore: 5,
    includeWatchHits: false,
    includeDigest: false,
    cooldownMinutes: 240,
    createdAt: "2026-06-18T00:00:00.000Z",
    updatedAt: "2026-06-18T00:00:00.000Z",
  };
}

function junoLiveReadySettings(
  options: {
    delayMinState?: SettingDescriptor["state"];
    delayMinDisplay?: string;
    delayMaxDisplay?: string;
    pollIntervalDisplay?: string;
    autoEnqueue?: boolean;
  } = {},
): SettingDescriptor[] {
  const autoEnqueue = options.autoEnqueue ?? true;
  return [
    setting("juno_login_email", "Juno login email", "database", "configured", "operator@example.test", false, true, "email"),
    setting("juno_login_password", "Juno login password", "database", "configured", "Saved", true, true),
    setting("juno_live_concurrency", "Concurrency", "database", "configured", "1", false, true, "number"),
    setting("juno_live_delay_min_ms", "Delay min", "database", options.delayMinState ?? "configured", options.delayMinDisplay ?? "30000", false, true, "number"),
    setting("juno_live_delay_max_ms", "Delay max", "database", "configured", options.delayMaxDisplay ?? "180000", false, true, "number"),
    setting("juno_live_poll_interval_ms", "Poll interval", "database", options.pollIntervalDisplay === "manual only" ? "disabled" : "configured", options.pollIntervalDisplay ?? "900000", false, true, "number"),
    {
      ...setting("juno_live_auto_enqueue_on_interval", "Auto enqueue on interval", "database", "configured", autoEnqueue ? "On" : "Off", false, true, "boolean"),
      value: autoEnqueue,
    },
  ];
}

function setting(
  key: string,
  label: string,
  source: "database" | "runtime" | "default" | "unset",
  state: "configured" | "missing" | "disabled" | "invalid",
  displayValue: string,
  secret: boolean,
  editable: boolean,
  type: SettingDescriptor["type"] = secret ? "secret" : "string",
): SettingDescriptor {
  return {
    key,
    label,
    value: secret ? null : displayValue,
    displayValue,
    source,
    state,
    secret,
    editable,
    clearable: source === "database" && editable,
    required: state === "missing",
    help: `${label} help`,
    type,
    runtimeOnly: !editable,
    advanced: false,
  };
}
