import type { RuntimeEnv } from "@/lib/env";
import { redactSsoProvider, type PublicSsoProvider, type SsoProviderRecord } from "@/lib/auth/sso-provider-repository";
import { resolveSsoProviderClientSecret } from "@/lib/auth/settings";
import { settingDefinitions, type SettingsGroup, type SettingsResponse, type IntegrationUnitStatus } from "./descriptors";
import { resolveSettingDescriptor, type RawRuntimeEnv, type SettingResolutionContext } from "./masking";
import { collectSettingsWarnings } from "./validation";
import type { ServiceSettingsRow, SettingsGroupId, NextAction } from "./descriptors";
import type { PublicMailboxSource } from "@/lib/ingest/mail-source";

const groupOrder: SettingsGroupId[] = ["auth", "mail", "juno", "notifications"];

export function buildSettingsResponse(options: {
  env: RuntimeEnv;
  rawEnv: RawRuntimeEnv;
  settingsRow: ServiceSettingsRow | null;
  nodeEnv: string;
  currentRequestOrigin?: string | null;
  adminUserCount?: number | null;
  mailSources?: PublicMailboxSource[];
  ssoProviders?: SsoProviderRecord[];
}): SettingsResponse {
  const mailSources = options.mailSources ?? [];
  const ssoProviders = options.ssoProviders ?? [];
  const junoLookupEnabled = isJunoLookupEnabled(options.settingsRow);
  const context: SettingResolutionContext = {
    externalProviderEnabled: ssoProviders.some((provider) => provider.enabled),
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
    rawEnv: options.rawEnv,
    nodeEnv: options.nodeEnv,
    currentRequestOrigin: options.currentRequestOrigin ?? null,
    ssoProviders,
  });
  const groups: SettingsGroup[] = groupOrder.map((groupId) => {
    const settings = descriptors.filter((descriptor) => descriptorGroup(descriptor.key) === groupId);
    const warningForGroup = warnings.some((warning) => warning.id.startsWith(groupId));
    return {
      id: groupId,
      label: groupLabel(groupId),
      state: groupId === "mail"
        ? mailGroupState(mailSources)
        : groupId === "notifications"
          ? "complete"
          : groupState(settings, warningForGroup),
      settings,
    };
  });

  return {
    environment: {
      nodeEnv: options.nodeEnv,
      appBaseUrl: resolveAppBaseUrl(options.settingsRow),
      currentRequestOrigin: options.currentRequestOrigin ?? null,
      deploymentMode: resolveDeploymentMode(options.nodeEnv),
      lastUpdatedAt: options.settingsRow?.updated_at ? new Date(options.settingsRow.updated_at).toISOString() : null,
      readOnlyBoundary: {
        noCart: true,
        noOrdering: true,
        noCheckout: true,
      },
    },
    units: {
      authProvider: buildAuthProviderUnit(options.settingsRow, ssoProviders, options.rawEnv),
      mail: buildMailUnit(mailSources),
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
        externalProviderEnabled: ssoProviders.some((provider) => provider.enabled),
        providerAdminRuleConfigured: ssoProviders.some((provider) => provider.adminRules.length > 0),
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
  return definition?.group ?? "notifications";
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
      detail: "Create an active mail source with a configured read-only credential.",
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

function resolveAppBaseUrl(row: ServiceSettingsRow | null): string | null {
  return row?.auth_base_url ?? null;
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

function isJunoLookupEnabled(row: ServiceSettingsRow | null): boolean {
  const enqueueOnIngest = row?.juno_live_enqueue_on_ingest ?? false;
  const autoEnqueueOnInterval = row?.juno_live_auto_enqueue_on_interval ?? false;
  const pollInterval = row?.juno_live_poll_interval_ms ?? null;
  return Boolean(enqueueOnIngest || autoEnqueueOnInterval || pollInterval);
}

function buildAuthProviderUnit(
  row: ServiceSettingsRow | null,
  providers: SsoProviderRecord[],
  rawEnv: RawRuntimeEnv,
): SettingsResponse["units"]["authProvider"] {
  const baseUrl = resolveAppBaseUrl(row);
  const publicProviders = providers.map((provider) =>
    redactSsoProvider(provider, baseUrl, {
      clientSecretAvailable: Boolean(resolveSsoProviderClientSecret(provider, rawEnv)),
    }),
  ).map(toSsoProviderUnit);
  const enabledProviderCount = publicProviders.filter((provider) => provider.enabled).length;
  const readyProviderCount = publicProviders.filter((provider) => provider.status === "ready").length;
  const status: IntegrationUnitStatus = enabledProviderCount === 0
    ? "disabled"
    : readyProviderCount > 0
      ? "ready"
      : publicProviders.some((provider) => provider.status === "invalid")
        ? "invalid"
        : "missing";

  return {
    id: "auth_provider",
    label: "Auth SSO Providers",
    status,
    providerCount: publicProviders.length,
    enabledProviderCount,
    readyProviderCount,
    providers: publicProviders,
    detail: readyProviderCount > 0
      ? `${readyProviderCount} SSO provider${readyProviderCount === 1 ? "" : "s"} ready for the Sign in page.`
      : enabledProviderCount > 0
        ? "Enabled SSO providers need valid discovery, client, secret, and Site address settings."
        : "External SSO providers are optional and currently disabled.",
  };
}

function toSsoProviderUnit(provider: PublicSsoProvider): SettingsResponse["units"]["authProvider"]["providers"][number] {
  const emailAllowlist = provider.adminRules
    .filter((rule) => rule.type === "email_allowlist")
    .map((rule) => rule.value);
  const claimRule = provider.adminRules.find((rule) => rule.type === "claim_equals")?.value ?? null;
  const [adminClaim, ...adminClaimValueParts] = claimRule?.split("=") ?? [];
  return {
    id: provider.id,
    providerId: provider.providerId,
    displayName: provider.displayName,
    buttonLabel: provider.buttonLabel,
    logoUrl: provider.logoUrl,
    protocol: provider.protocol,
    preset: provider.preset,
    enabled: provider.enabled,
    status: provider.status,
    discoveryUrl: provider.discoveryUrl,
    authorizationUrl: provider.authorizationUrl,
    tokenUrl: provider.tokenUrl,
    userInfoUrl: provider.userInfoUrl,
    clientId: provider.clientId,
    clientSecretRef: provider.clientSecretRef,
    clientSecretConfigured: provider.clientSecretConfigured,
    scopes: provider.scopes,
    callbackUrl: provider.callbackUrl,
    adminEmailAllowlist: emailAllowlist,
    adminClaim: adminClaim || null,
    adminClaimValue: adminClaimValueParts.join("=") || null,
    sortOrder: provider.sortOrder,
    missing: provider.missing,
    invalid: provider.invalid,
  };
}

function buildMailUnit(sources: PublicMailboxSource[]): SettingsResponse["units"]["mail"] {
  const runnableSources = sources.filter(isRunnableMailSource);
  const activeSources = sources.filter((source) => source.isActive);
  const missing = runnableSources.length === 0;
  const warning = activeSources.some((source) => source.provider !== "gmail");
  return {
    id: "mail_sources",
    label: "Mail sources",
    status: missing ? "missing" : warning ? "warning" : runnableSources.length > 0 ? "ready" : "disabled",
    detail: missing
      ? "At least one active mail source with an implemented read-only adapter is required."
      : warning
        ? "One or more active mail sources use a provider adapter that is not implemented yet."
        : runnableSources.length > 0
          ? `${runnableSources.length} runnable mail source${runnableSources.length === 1 ? "" : "s"} configured.`
          : "No runnable mail source configured.",
    configured: runnableSources.length > 0,
    optional: false,
  };
}

function mailGroupState(sources: PublicMailboxSource[]): SettingsGroup["state"] {
  const activeSources = sources.filter((source) => source.isActive);
  const runnableSources = activeSources.filter(isRunnableMailSource);
  if (runnableSources.length === 0) {
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
  providerAdminRuleConfigured: boolean;
}): SettingsResponse["security"]["authBootstrap"] {
  const hasExistingAdmin = (options.adminUserCount ?? 0) > 0;
  const hasExternalAdminMapping = options.externalProviderEnabled && options.providerAdminRuleConfigured;

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
