import type { RuntimeEnv } from "@/lib/env";

export type AuthServiceSettingsRow = {
  auth_secret: string | null;
  auth_base_url: string | null;
  auth_trusted_origins: string | null;
  auth_external_provider_enabled: boolean | null;
  auth_external_provider_id: string | null;
  auth_external_provider_name: string | null;
  auth_external_provider_logo_url: string | null;
  auth_external_provider_button_label: string | null;
  auth_external_discovery_url: string | null;
  auth_external_client_id: string | null;
  auth_external_client_secret: string | null;
  auth_external_provider_scopes: string | null;
  auth_admin_email_allowlist: string | null;
  auth_external_admin_claim: string | null;
  auth_external_admin_claim_value: string | null;
};

export type ExternalAuthProviderSettings = {
  providerId: string;
  name: string;
  buttonLabel: string;
  logoUrl: string | undefined;
  discoveryUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
};

export type AppAuthSettings = {
  secret: string | undefined;
  baseUrl: string | undefined;
  trustedOrigins: string[];
  externalProviderEnabled: boolean;
  externalProvider: ExternalAuthProviderSettings | null;
  adminEmailAllowlist: string[];
  externalAdminClaim: string | undefined;
  externalAdminClaimValue: string | undefined;
  initialAdmin: InitialAdminSettings | null;
};

export type InitialAdminSettings = {
  email: string;
  password: string;
  name: string;
};

export function resolveAppAuthSettings(
  env: RuntimeEnv,
  row: AuthServiceSettingsRow | null,
  options: { requestOrigin?: string | null } = {},
): AppAuthSettings {
  const externalProviderEnabled =
    row?.auth_external_provider_enabled ?? env.AUTH_EXTERNAL_PROVIDER_ENABLED;
  const externalProvider = resolveExternalProvider(env, row, externalProviderEnabled);

  return {
    secret: row?.auth_secret ?? env.AUTH_SECRET,
    baseUrl: row?.auth_base_url ?? env.AUTH_BASE_URL ?? options.requestOrigin ?? undefined,
    trustedOrigins: splitList(row?.auth_trusted_origins ?? env.AUTH_TRUSTED_ORIGINS),
    externalProviderEnabled,
    externalProvider,
    adminEmailAllowlist: splitList(row?.auth_admin_email_allowlist ?? env.AUTH_ADMIN_EMAIL_ALLOWLIST),
    externalAdminClaim: trimOptional(row?.auth_external_admin_claim ?? env.AUTH_EXTERNAL_ADMIN_CLAIM),
    externalAdminClaimValue: trimOptional(row?.auth_external_admin_claim_value ?? env.AUTH_EXTERNAL_ADMIN_CLAIM_VALUE),
    initialAdmin: resolveInitialAdmin(env),
  };
}

export function getMissingAppAuthSettings(settings: AppAuthSettings): string[] {
  return [
    requiredSetting("auth_base_url", settings.baseUrl),
  ].filter((value): value is string => Boolean(value));
}

export function isAppAuthRunnable(settings: AppAuthSettings): boolean {
  return getMissingAppAuthSettings(settings).length === 0;
}

export function splitList(value: string | undefined | null): string[] {
  return (
    value
      ?.split(/[,\n]+/)
      .map((item) => item.trim())
      .filter(Boolean) ?? []
  );
}

export function resolveExternalProfileRole(profile: unknown, settings: AppAuthSettings): "admin" | "user" {
  const email = readStringClaim(profile, "email")?.toLowerCase();
  if (email && settings.adminEmailAllowlist.map((entry) => entry.toLowerCase()).includes(email)) {
    return "admin";
  }

  if (settings.externalAdminClaim && settings.externalAdminClaimValue) {
    const claim = readClaim(profile, settings.externalAdminClaim);
    if (claimMatchesValue(claim, settings.externalAdminClaimValue)) {
      return "admin";
    }
  }

  return "user";
}

function resolveExternalProvider(
  env: RuntimeEnv,
  row: AuthServiceSettingsRow | null,
  enabled: boolean,
): ExternalAuthProviderSettings | null {
  if (!enabled) {
    return null;
  }

  const providerId = row?.auth_external_provider_id ?? env.AUTH_EXTERNAL_PROVIDER_ID;
  const discoveryUrl = row?.auth_external_discovery_url ?? env.AUTH_EXTERNAL_DISCOVERY_URL;
  const clientId = row?.auth_external_client_id ?? env.AUTH_EXTERNAL_CLIENT_ID;
  const clientSecret = row?.auth_external_client_secret ?? env.AUTH_EXTERNAL_CLIENT_SECRET;
  const name = row?.auth_external_provider_name ?? env.AUTH_EXTERNAL_PROVIDER_NAME ?? providerId ?? "External";

  return {
    providerId: providerId ?? "",
    name,
    buttonLabel: row?.auth_external_provider_button_label ?? env.AUTH_EXTERNAL_PROVIDER_BUTTON_LABEL ?? `Continue with ${name}`,
    logoUrl: trimOptional(row?.auth_external_provider_logo_url ?? env.AUTH_EXTERNAL_PROVIDER_LOGO_URL),
    discoveryUrl: discoveryUrl ?? "",
    clientId: clientId ?? "",
    clientSecret: clientSecret ?? "",
    scopes: splitScopeList(row?.auth_external_provider_scopes ?? env.AUTH_EXTERNAL_PROVIDER_SCOPES),
  };
}

function resolveInitialAdmin(env: RuntimeEnv): InitialAdminSettings | null {
  if (!env.AUTH_INITIAL_ADMIN_EMAIL || !env.AUTH_INITIAL_ADMIN_PASSWORD) {
    return null;
  }

  return {
    email: env.AUTH_INITIAL_ADMIN_EMAIL,
    password: env.AUTH_INITIAL_ADMIN_PASSWORD,
    name: env.AUTH_INITIAL_ADMIN_NAME,
  };
}

function requiredSetting(name: string, value: string | undefined): string | null {
  return value?.trim() ? null : name;
}

function trimOptional(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function splitScopeList(value: string | undefined | null): string[] {
  return (
    value
      ?.split(/[,\s]+/)
      .map((item) => item.trim())
      .filter(Boolean) ?? []
  );
}

function readStringClaim(profile: unknown, key: string): string | undefined {
  const value = readClaim(profile, key);
  return typeof value === "string" ? value : undefined;
}

function readClaim(profile: unknown, key: string): unknown {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    return undefined;
  }
  return (profile as Record<string, unknown>)[key];
}

function claimMatchesValue(claim: unknown, expected: string): boolean {
  if (Array.isArray(claim)) {
    return claim.some((entry) => typeof entry === "string" && entry === expected);
  }
  if (typeof claim === "string") {
    return claim === expected || claim.split(",").map((entry) => entry.trim()).includes(expected);
  }
  return false;
}
