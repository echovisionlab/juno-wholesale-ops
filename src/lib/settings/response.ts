import type { RuntimeEnv } from "@/lib/env";
import { parseScopes } from "@/lib/env";
import { settingDefinitions, type SettingsGroup, type SettingsResponse, type DataMode, type IntegrationUnitStatus } from "./descriptors";
import { resolveSettingDescriptor, hasSettingValue, type RawRuntimeEnv, type SettingResolutionContext } from "./masking";
import { collectSettingsWarnings } from "./validation";
import type { ServiceSettingsRow, SettingsGroupId, NextAction } from "./descriptors";
import type { PublicMailboxSource } from "@/lib/ingest/mail-source";

const groupOrder: SettingsGroupId[] = ["system", "auth", "mail", "juno", "notifications", "advanced"];

export function buildSettingsResponse(options: {
  env: RuntimeEnv;
  rawEnv: RawRuntimeEnv;
  settingsRow: ServiceSettingsRow | null;
  nodeEnv: string;
  currentRequestOrigin?: string | null;
  adminUserCount?: number | null;
  mailSources?: PublicMailboxSource[];
}): SettingsResponse {
  const dataMode = resolveDataMode(options.settingsRow, options.env);
  const mailSources = options.mailSources ?? [];
  const externalProviderEnabled = options.settingsRow?.auth_external_provider_enabled ?? options.env.AUTH_EXTERNAL_PROVIDER_ENABLED;
  const junoLookupEnabled = isJunoLookupEnabled(options.settingsRow, options.env);
  const context: SettingResolutionContext = {
    dataMode,
    externalProviderEnabled,
    junoLookupEnabled,
  };
  const descriptors = settingDefinitions.map((definition) =>
    resolveSettingDescriptor({
      definition,
      row: options.settingsRow,
      env: options.env,
      rawEnv: options.rawEnv,
      context,
    }),
  );
  const warnings = collectSettingsWarnings({
    row: options.settingsRow,
    env: options.env,
    nodeEnv: options.nodeEnv,
    currentRequestOrigin: options.currentRequestOrigin ?? null,
  });
  const groups: SettingsGroup[] = groupOrder.map((groupId) => {
    const settings =
      groupId === "advanced"
        ? descriptors
        : descriptors.filter((descriptor) => descriptorGroup(descriptor.key) === groupId);
    const warningForGroup = warnings.some((warning) => warning.id.startsWith(groupId));
    return {
      id: groupId,
      label: groupLabel(groupId),
      state: groupId === "mail" ? mailGroupState(dataMode, mailSources) : groupState(settings, warningForGroup),
      settings,
    };
  });

  return {
    environment: {
      nodeEnv: options.nodeEnv,
      appBaseUrl: resolveAppBaseUrl(options.settingsRow, options.env),
      currentRequestOrigin: options.currentRequestOrigin ?? null,
      deploymentMode: resolveDeploymentMode(options.nodeEnv),
      lastUpdatedAt: options.settingsRow?.updated_at ? new Date(options.settingsRow.updated_at).toISOString() : null,
      readOnlyBoundary: {
        noCart: true,
        noOrdering: true,
        noCheckout: true,
      },
    },
    dataMode: {
      value: dataMode,
      source: descriptorByKey(descriptors, "data_mode")?.source ?? "default",
      status: dataMode,
      detail: dataMode === "demo"
        ? "Synthetic demo data mode. Mail sources are optional."
        : "Real mailbox mode. At least one runnable mail source is required.",
    },
    units: {
      authProvider: buildAuthProviderUnit(options.settingsRow, options.env),
      mail: buildMailUnit(mailSources, dataMode),
      junoLive: buildJunoUnit(groups, junoLookupEnabled),
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
      authBootstrap: buildAuthBootstrapStatus({
        initialAdminConfigured: Boolean(options.env.AUTH_INITIAL_ADMIN_EMAIL && options.env.AUTH_INITIAL_ADMIN_PASSWORD),
        adminUserCount: options.adminUserCount ?? null,
        externalProviderEnabled,
        adminAllowlistConfigured: hasSettingValue(options.settingsRow?.auth_admin_email_allowlist ?? options.env.AUTH_ADMIN_EMAIL_ALLOWLIST),
        adminClaimConfigured: hasSettingValue(options.settingsRow?.auth_external_admin_claim ?? options.env.AUTH_EXTERNAL_ADMIN_CLAIM)
          && hasSettingValue(options.settingsRow?.auth_external_admin_claim_value ?? options.env.AUTH_EXTERNAL_ADMIN_CLAIM_VALUE),
      }),
    },
    mailSources,
    groups,
    nextActions: buildNextActions(groups, warnings),
    warnings,
  };
}

function descriptorGroup(key: string): SettingsGroupId {
  const definition = settingDefinitions.find((entry) => entry.key === key);
  return definition?.group ?? "advanced";
}

function groupLabel(id: SettingsGroupId): string {
  if (id === "mail") {
    return "Mail Sources";
  }
  if (id === "juno") {
    return "Juno Live";
  }
  if (id === "auth") {
    return "Auth";
  }
  if (id === "notifications") {
    return "Notifications";
  }
  if (id === "advanced") {
    return "Advanced";
  }
  return "System";
}

function groupState(settings: SettingsGroup["settings"], warning: boolean): SettingsGroup["state"] {
  if (settings.some((setting) => setting.state === "missing")) {
    return "missing";
  }
  if (warning) {
    return "warning";
  }
  if (settings.every((setting) => setting.state === "disabled")) {
    return "disabled";
  }
  return "complete";
}

function buildNextActions(groups: SettingsGroup[], warnings: SettingsResponse["warnings"]): NextAction[] {
  const actions: NextAction[] = [];
  const missingGroups = groups.filter((group) => group.state === "missing");

  if (missingGroups.length > 0) {
    actions.push({
      id: "open-settings-center",
      label: "Open Settings Center",
      detail: `Complete ${missingGroups.map((group) => group.label).join(", ")} before enabling ingest or live lookup actions.`,
      href: "/settings",
      severity: "critical",
    });
  }

  if (groups.find((group) => group.id === "mail")?.state === "missing") {
    actions.push({
      id: "configure-mail-source",
      label: "Configure a mail source",
      detail: "Create an active Gmail mailbox source with Google Workspace delegation and a JSON service account credential.",
      href: "/settings",
      action: "test-gmail",
      severity: "warning",
    });
  }

  if (settingsInGroup(groups, "juno").some((setting) => setting.state === "missing")) {
    actions.push({
      id: "configure-juno",
      label: "Configure read-only Juno live lookup",
      detail: "Set login credentials and safe delay bounds before starting the browser worker.",
      href: "/settings",
      action: "test-juno-session",
      severity: "warning",
    });
  }

  for (const warning of warnings.filter((entry) => entry.severity === "critical")) {
    actions.push({
      id: `warning-${warning.id}`,
      label: "Resolve critical setting warning",
      detail: warning.message,
      href: "/settings",
      severity: "critical",
    });
  }

  if (actions.length === 0) {
    actions.push({
      id: "review-read-only-boundary",
      label: "Review read-only operating boundary",
      detail: "Settings are usable. Keep live lookup and notification delivery observation-only.",
      href: "/settings",
      severity: "info",
    });
  }

  return actions;
}

function settingsInGroup(groups: SettingsGroup[], id: SettingsGroupId): SettingsGroup["settings"] {
  return groups.find((group) => group.id === id)?.settings ?? [];
}

function resolveAppBaseUrl(row: ServiceSettingsRow | null, env: RuntimeEnv): string | null {
  return row?.auth_base_url ?? env.AUTH_BASE_URL ?? null;
}

function resolveDeploymentMode(nodeEnv: string): SettingsResponse["environment"]["deploymentMode"] {
  if (nodeEnv === "production") {
    return "production";
  }
  if (nodeEnv === "development" || nodeEnv === "test") {
    return "development";
  }
  return "unknown";
}

function resolveDataMode(row: ServiceSettingsRow | null, env: RuntimeEnv): DataMode {
  return row?.data_mode ?? env.JUNO_WHOLESALE_OPS_DATA_MODE;
}

function isJunoLookupEnabled(row: ServiceSettingsRow | null, env: RuntimeEnv): boolean {
  const enqueueOnIngest = row?.juno_live_enqueue_on_ingest ?? env.JUNO_LIVE_ENQUEUE_ON_INGEST;
  const autoEnqueueOnInterval = row?.juno_live_auto_enqueue_on_interval ?? env.JUNO_LIVE_AUTO_ENQUEUE_ON_INTERVAL;
  const pollInterval = row?.juno_live_poll_interval_ms ?? env.JUNO_LIVE_POLL_INTERVAL_MS;
  return Boolean(enqueueOnIngest || autoEnqueueOnInterval || pollInterval);
}

function descriptorByKey(settings: SettingsGroup["settings"], key: string) {
  return settings.find((setting) => setting.key === key);
}

function buildAuthProviderUnit(row: ServiceSettingsRow | null, env: RuntimeEnv): SettingsResponse["units"]["authProvider"] {
  const enabled = row?.auth_external_provider_enabled ?? env.AUTH_EXTERNAL_PROVIDER_ENABLED;
  const providerId = trimOptional(row?.auth_external_provider_id ?? env.AUTH_EXTERNAL_PROVIDER_ID);
  const displayName = trimOptional(row?.auth_external_provider_name ?? env.AUTH_EXTERNAL_PROVIDER_NAME) ?? providerId ?? "External provider";
  const buttonLabel = trimOptional(row?.auth_external_provider_button_label ?? env.AUTH_EXTERNAL_PROVIDER_BUTTON_LABEL) ?? `Continue with ${displayName}`;
  const baseUrl = resolveAppBaseUrl(row, env);
  const clientId = trimOptional(row?.auth_external_client_id ?? env.AUTH_EXTERNAL_CLIENT_ID);
  const discoveryUrl = trimOptional(row?.auth_external_discovery_url ?? env.AUTH_EXTERNAL_DISCOVERY_URL);
  const clientSecretConfigured = hasSettingValue(row?.auth_external_client_secret ?? env.AUTH_EXTERNAL_CLIENT_SECRET);
  const missing = [
    providerId ? null : "provider id",
    discoveryUrl ? null : "discovery URL",
    clientId ? null : "client ID",
    clientSecretConfigured ? null : "client secret",
    baseUrl ? null : "site address",
  ].filter(Boolean);
  const status: IntegrationUnitStatus = !enabled ? "disabled" : missing.length > 0 ? "missing" : "ready";

  return {
    id: "auth_provider",
    label: "Auth Provider",
    providerType: "generic_oauth_oidc",
    enabled,
    status,
    displayName,
    buttonLabel,
    providerId: providerId ?? null,
    logoUrl: trimOptional(row?.auth_external_provider_logo_url ?? env.AUTH_EXTERNAL_PROVIDER_LOGO_URL) ?? null,
    discoveryUrl: discoveryUrl ?? null,
    clientId: clientId ?? null,
    clientSecretConfigured,
    scopes: parseScopes(row?.auth_external_provider_scopes ?? env.AUTH_EXTERNAL_PROVIDER_SCOPES),
    callbackUrl: baseUrl && providerId ? `${baseUrl.replace(/\/+$/, "")}/api/auth/oauth2/callback/${providerId}` : null,
    adminEmailAllowlistConfigured: hasSettingValue(row?.auth_admin_email_allowlist ?? env.AUTH_ADMIN_EMAIL_ALLOWLIST),
    adminClaimMappingConfigured: hasSettingValue(row?.auth_external_admin_claim ?? env.AUTH_EXTERNAL_ADMIN_CLAIM)
      && hasSettingValue(row?.auth_external_admin_claim_value ?? env.AUTH_EXTERNAL_ADMIN_CLAIM_VALUE),
    detail: enabled
      ? missing.length > 0
        ? `Missing ${missing.join(", ")}.`
        : "Generic OAuth/OIDC sign-in is ready."
      : "External auth provider is disabled.",
  };
}

function buildMailUnit(sources: PublicMailboxSource[], dataMode: DataMode): SettingsResponse["units"]["mail"] {
  const runnableSources = sources.filter(isRunnableMailSource);
  const activeSources = sources.filter((source) => source.isActive);
  const missing = dataMode === "real_mailbox" && runnableSources.length === 0;
  const warning = activeSources.some((source) => source.provider !== "gmail");
  return {
    id: "mail_sources",
    label: "Mail sources",
    status: missing ? "missing" : warning ? "warning" : runnableSources.length > 0 ? "ready" : "disabled",
    detail: missing
      ? "Real mailbox mode requires at least one active Gmail source with a configured JSON service account credential."
      : warning
        ? "One or more active mail sources use a provider adapter that is not implemented yet."
        : runnableSources.length > 0
          ? `${runnableSources.length} runnable Gmail source${runnableSources.length === 1 ? "" : "s"} configured.`
          : "Mail ingest is optional while demo mode is selected.",
    configured: runnableSources.length > 0,
    optional: false,
  };
}

function mailGroupState(dataMode: DataMode, sources: PublicMailboxSource[]): SettingsGroup["state"] {
  const activeSources = sources.filter((source) => source.isActive);
  const runnableSources = activeSources.filter(isRunnableMailSource);
  if (dataMode === "real_mailbox" && runnableSources.length === 0) {
    return "missing";
  }
  if (activeSources.some((source) => source.provider !== "gmail")) {
    return "warning";
  }
  return runnableSources.length > 0 ? "complete" : "disabled";
}

function isRunnableMailSource(source: PublicMailboxSource): boolean {
  return (
    source.isActive &&
    source.provider === "gmail" &&
    source.authType === "google_workspace_delegation" &&
    source.credentialType === "google_service_account_json" &&
    source.credentialConfigured
  );
}

function buildJunoUnit(groups: SettingsGroup[], junoLookupEnabled: boolean): SettingsResponse["units"]["junoLive"] {
  const juno = groups.find((group) => group.id === "juno");
  const hasMissing = juno?.settings.some((setting) => setting.state === "missing") ?? false;
  return {
    id: "juno_live",
    label: "Read-only live lookup",
    status: !junoLookupEnabled ? "disabled" : hasMissing ? "missing" : "ready",
    detail: !junoLookupEnabled
      ? "Live lookup is optional and currently disabled."
      : hasMissing
        ? "Worker start is blocked until read-only login credentials and safe pacing are configured."
        : "Live lookup can run in read-only browser mode.",
    configured: junoLookupEnabled && !hasMissing,
    optional: true,
  };
}

function buildAuthBootstrapStatus(options: {
  initialAdminConfigured: boolean;
  adminUserCount: number | null;
  externalProviderEnabled: boolean;
  adminAllowlistConfigured: boolean;
  adminClaimConfigured: boolean;
}): SettingsResponse["security"]["authBootstrap"] {
  const hasExistingAdmin = (options.adminUserCount ?? 0) > 0;
  const hasExternalAdminMapping = options.externalProviderEnabled && (options.adminAllowlistConfigured || options.adminClaimConfigured);

  if (hasExistingAdmin || options.initialAdminConfigured || hasExternalAdminMapping) {
    return {
      status: "ready",
      adminUserCount: options.adminUserCount,
      hasInitialAdminEnv: options.initialAdminConfigured,
      hasExternalAdminMapping,
      detail: hasExistingAdmin
        ? "At least one admin user exists."
        : options.initialAdminConfigured
          ? "Initial admin env can bootstrap admin access."
          : "External provider admin allowlist or claim mapping can bootstrap admin access.",
    };
  }

  return {
    status: "blocked",
    adminUserCount: options.adminUserCount,
    hasInitialAdminEnv: false,
    hasExternalAdminMapping: false,
    detail: "Auth bootstrap blocked. No admin access path configured.",
  };
}

function trimOptional(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
