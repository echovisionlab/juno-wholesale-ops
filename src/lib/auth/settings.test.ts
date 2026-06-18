import { describe, expect, it } from "vitest";
import { loadRuntimeEnv } from "@/lib/env";
import {
  getMissingAppAuthSettings,
  isAppAuthRunnable,
  resolveExternalProfileRole,
  resolveAppAuthSettings,
  splitScopeList,
  splitList,
  type AuthServiceSettingsRow,
} from "./settings";


function runtimeEnv(overrides: Record<string, string | boolean | number | undefined> = {}) {
  return loadRuntimeEnv({
    DATABASE_URL: "postgres://user:pass@localhost:5432/app",
    ...overrides,
  });
}

describe("resolveAppAuthSettings", () => {
  it("defaults to always-on auth with local email/password without exposing the internal secret as an operator setting", () => {
    const settings = resolveAppAuthSettings(
      runtimeEnv({ DATABASE_URL: "postgres://user:pass@localhost:5432/app" }),
      null,
    );

    expect(settings.emailPasswordEnabled).toBe(true);
    expect(settings.externalProvider).toBeNull();
    expect(getMissingAppAuthSettings(settings)).toEqual(["auth_base_url"]);
    expect(isAppAuthRunnable(settings)).toBe(false);
  });

  it("resolves complete env-based external provider settings", () => {
    const settings = resolveAppAuthSettings(
      runtimeEnv({
        AUTH_SECRET: "a".repeat(32),
        AUTH_BASE_URL: "https://app.example.com",
        AUTH_TRUSTED_ORIGINS: "https://app.example.com\nhttps://admin.example.com",
        AUTH_EMAIL_PASSWORD_ENABLED: "false",
        AUTH_EXTERNAL_PROVIDER_ENABLED: "true",
        AUTH_EXTERNAL_PROVIDER_ID: "workspace",
        AUTH_EXTERNAL_PROVIDER_NAME: "Workspace",
        AUTH_EXTERNAL_PROVIDER_BUTTON_LABEL: "Sign in with Workspace",
        AUTH_EXTERNAL_PROVIDER_LOGO_URL: "https://login.example.com/logo.png",
        AUTH_EXTERNAL_DISCOVERY_URL: "https://login.example.com/.well-known/openid-configuration",
        AUTH_EXTERNAL_CLIENT_ID: "client-id",
        AUTH_EXTERNAL_CLIENT_SECRET: "client-secret",
        AUTH_EXTERNAL_PROVIDER_SCOPES: "openid email profile groups",
        AUTH_ADMIN_EMAIL_ALLOWLIST: "admin@example.com",
        AUTH_EXTERNAL_ADMIN_CLAIM: "groups",
        AUTH_EXTERNAL_ADMIN_CLAIM_VALUE: "ops",
        AUTH_INITIAL_ADMIN_EMAIL: "admin@example.com",
        AUTH_INITIAL_ADMIN_PASSWORD: "password123",
      }),
      null,
    );

    expect(settings).toMatchObject({
      secret: "a".repeat(32),
      baseUrl: "https://app.example.com",
      trustedOrigins: ["https://app.example.com", "https://admin.example.com"],
      emailPasswordEnabled: false,
      externalProviderEnabled: true,
      externalProvider: {
        providerId: "workspace",
        name: "Workspace",
        buttonLabel: "Sign in with Workspace",
        logoUrl: "https://login.example.com/logo.png",
        discoveryUrl: "https://login.example.com/.well-known/openid-configuration",
        clientId: "client-id",
        clientSecret: "client-secret",
        scopes: ["openid", "email", "profile", "groups"],
      },
      adminEmailAllowlist: ["admin@example.com"],
      externalAdminClaim: "groups",
      externalAdminClaimValue: "ops",
      initialAdmin: {
        email: "admin@example.com",
        password: "password123",
        name: "Initial Admin",
      },
    });
    expect(getMissingAppAuthSettings(settings)).toEqual([]);
    expect(isAppAuthRunnable(settings)).toBe(true);
  });

  it("lets database settings override env auth settings", () => {
    const settings = resolveAppAuthSettings(
      runtimeEnv({
        AUTH_SECRET: "a".repeat(32),
        AUTH_BASE_URL: "https://env.example.com",
        AUTH_EMAIL_PASSWORD_ENABLED: "true",
        AUTH_EXTERNAL_PROVIDER_ENABLED: "false",
      }),
      {
        ...emptyRow(),
        auth_base_url: "https://db.example.com",
        auth_email_password_enabled: false,
        auth_external_provider_enabled: true,
        auth_external_provider_id: "oidc",
        auth_external_provider_name: "OIDC",
        auth_external_discovery_url: "https://oidc.example.com/.well-known/openid-configuration",
        auth_external_client_id: "db-client",
        auth_external_client_secret: "db-secret",
      },
    );

    expect(settings.baseUrl).toBe("https://db.example.com");
    expect(settings.emailPasswordEnabled).toBe(false);
    expect(settings.externalProvider).toMatchObject({
      providerId: "oidc",
      name: "OIDC",
      clientId: "db-client",
    });
  });

  it("reports missing runnable external provider settings", () => {
    const settings = resolveAppAuthSettings(
      runtimeEnv({
        AUTH_EMAIL_PASSWORD_ENABLED: "false",
        AUTH_EXTERNAL_PROVIDER_ENABLED: "true",
      }),
      null,
    );

    expect(getMissingAppAuthSettings(settings)).toEqual([
      "auth_base_url",
      "auth_external_provider_id",
      "auth_external_discovery_url",
      "auth_external_client_id",
      "auth_external_client_secret",
    ]);
    expect(isAppAuthRunnable(settings)).toBe(false);
  });

  it("reports when every sign-in method is disabled", () => {
    const settings = resolveAppAuthSettings(
      runtimeEnv({
        AUTH_SECRET: "a".repeat(32),
        AUTH_BASE_URL: "https://app.example.com",
        AUTH_EMAIL_PASSWORD_ENABLED: "false",
        AUTH_EXTERNAL_PROVIDER_ENABLED: "false",
      }),
      null,
    );

    expect(getMissingAppAuthSettings(settings)).toEqual([
      "auth_email_password_enabled or auth_external_provider_enabled",
    ]);
  });

  it("defaults external provider scopes to an empty list", () => {
    const settings = resolveAppAuthSettings(
      runtimeEnv({
        AUTH_SECRET: "a".repeat(32),
        AUTH_BASE_URL: "https://app.example.com",
      }),
      {
        ...emptyRow(),
        auth_email_password_enabled: false,
        auth_external_provider_enabled: true,
        auth_external_provider_id: "workspace",
        auth_external_discovery_url: "https://login.example.com/.well-known/openid-configuration",
        auth_external_client_id: "client-id",
        auth_external_client_secret: "client-secret",
        auth_external_provider_scopes: "",
      },
    );

    expect(settings.externalProvider?.scopes).toEqual([]);
  });

  it("splits blank external provider scopes as an empty list", () => {
    expect(splitScopeList(null)).toEqual([]);
    expect(splitScopeList("")).toEqual([]);
  });

  it("maps external provider profiles to admin only through configured allowlist or claim mapping", () => {
    const base = resolveAppAuthSettings(
      runtimeEnv({
        AUTH_BASE_URL: "https://app.example.com",
        AUTH_EMAIL_PASSWORD_ENABLED: "false",
        AUTH_EXTERNAL_PROVIDER_ENABLED: "true",
        AUTH_EXTERNAL_PROVIDER_ID: "workspace",
        AUTH_EXTERNAL_DISCOVERY_URL: "https://login.example.com/.well-known/openid-configuration",
        AUTH_EXTERNAL_CLIENT_ID: "client-id",
        AUTH_EXTERNAL_CLIENT_SECRET: "client-secret",
      }),
      null,
    );

    expect(resolveExternalProfileRole({ email: "admin@example.com", groups: ["ops"] }, base)).toBe("user");
    expect(resolveExternalProfileRole({ email: "admin@example.com" }, {
      ...base,
      adminEmailAllowlist: ["admin@example.com"],
    })).toBe("admin");
    expect(resolveExternalProfileRole({ email: "user@example.com", groups: ["ops"] }, {
      ...base,
      externalAdminClaim: "groups",
      externalAdminClaimValue: "ops",
    })).toBe("admin");
    expect(resolveExternalProfileRole({ email: "user@example.com", groups: "ops,staff" }, {
      ...base,
      externalAdminClaim: "groups",
      externalAdminClaimValue: "staff",
    })).toBe("admin");
    expect(resolveExternalProfileRole(null, {
      ...base,
      externalAdminClaim: "groups",
      externalAdminClaimValue: "ops",
    })).toBe("user");
    expect(resolveExternalProfileRole(["ops"], {
      ...base,
      externalAdminClaim: "groups",
      externalAdminClaimValue: "ops",
    })).toBe("user");
    expect(resolveExternalProfileRole({ email: true, groups: 42 }, {
      ...base,
      adminEmailAllowlist: ["admin@example.com"],
      externalAdminClaim: "groups",
      externalAdminClaimValue: "ops",
    })).toBe("user");
  });
});

describe("splitList", () => {
  it("splits comma and newline separated lists", () => {
    expect(splitList(" one,\ntwo ,, three ")).toEqual(["one", "two", "three"]);
    expect(splitList(null)).toEqual([]);
  });
});

function emptyRow(): AuthServiceSettingsRow {
  return {
    auth_secret: null,
    auth_base_url: null,
    auth_trusted_origins: null,
    auth_email_password_enabled: null,
    auth_external_provider_enabled: null,
    auth_external_provider_id: null,
    auth_external_provider_name: null,
    auth_external_provider_logo_url: null,
    auth_external_provider_button_label: null,
    auth_external_discovery_url: null,
    auth_external_client_id: null,
    auth_external_client_secret: null,
    auth_external_provider_scopes: null,
    auth_admin_email_allowlist: null,
    auth_external_admin_claim: null,
    auth_external_admin_claim_value: null,
  };
}
