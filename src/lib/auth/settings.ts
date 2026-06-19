import type { RuntimeEnv } from "@/lib/env";
import type { SsoProviderRecord, SsoAdminRule } from "./sso-provider-repository";

export type AuthServiceSettingsRow = {
  auth_secret: string | null;
  auth_base_url: string | null;
  auth_trusted_origins: string | null;
  auth_email_password_login_enabled: boolean;
};

export type ExternalAuthProviderSettings = {
  id: string;
  providerId: string;
  name: string;
  buttonLabel: string;
  logoUrl: string | undefined;
  discoveryUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
  adminRules: SsoAdminRule[];
};

export type AppAuthSettings = {
  secret: string | undefined;
  baseUrl: string | undefined;
  trustedOrigins: string[];
  emailPasswordLoginEnabled: boolean;
  externalProviders: ExternalAuthProviderSettings[];
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
  options: { requestOrigin?: string | null; ssoProviders?: SsoProviderRecord[] } = {},
): AppAuthSettings {
  return {
    secret: row?.auth_secret ?? env.AUTH_SECRET,
    baseUrl: row?.auth_base_url ?? env.AUTH_BASE_URL ?? options.requestOrigin ?? undefined,
    trustedOrigins: splitList(row?.auth_trusted_origins ?? env.AUTH_TRUSTED_ORIGINS),
    emailPasswordLoginEnabled: row?.auth_email_password_login_enabled ?? true,
    externalProviders: resolveExternalProviders(options.ssoProviders ?? []),
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

export function resolveExternalProfileRole(profile: unknown, settings: AppAuthSettings, providerId: string): "admin" | "user" {
  const provider = settings.externalProviders.find((entry) => entry.providerId === providerId);
  const rules = provider?.adminRules ?? [];
  const email = readStringClaim(profile, "email")?.toLowerCase();
  const emailAllowlist = rules
    .filter((rule) => rule.type === "email_allowlist")
    .map((rule) => rule.value.toLowerCase());
  if (email && emailAllowlist.includes(email)) {
    return "admin";
  }

  for (const rule of rules.filter((entry) => entry.type === "claim_equals")) {
    const [claimName, ...expectedParts] = rule.value.split("=");
    const expectedValue = expectedParts.join("=");
    if (claimName && expectedValue && claimMatchesValue(readClaim(profile, claimName), expectedValue)) {
      return "admin";
    }
  }

  return "user";
}

function resolveExternalProviders(providers: SsoProviderRecord[]): ExternalAuthProviderSettings[] {
  return providers
    .filter((provider) => provider.enabled)
    .map((provider) => ({
      id: provider.id,
      providerId: provider.providerId,
      name: provider.displayName,
      buttonLabel: provider.buttonLabel,
      logoUrl: provider.logoUrl ?? undefined,
      discoveryUrl: provider.discoveryUrl ?? "",
      clientId: provider.clientId ?? "",
      clientSecret: provider.clientSecret ?? "",
      scopes: provider.scopes,
      adminRules: provider.adminRules,
    }));
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
