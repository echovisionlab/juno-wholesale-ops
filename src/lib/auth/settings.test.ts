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
import type { SsoProviderRecord } from "./sso-provider-repository";

function runtimeEnv(overrides: Record<string, string | boolean | number | undefined> = {}) {
  return loadRuntimeEnv({
    DATABASE_URL: "postgres://user:pass@localhost:5432/app",
    ...overrides,
  });
}

describe("resolveAppAuthSettings", () => {
  it("requires site address while keeping email/password enabled by default", () => {
    const settings = resolveAppAuthSettings(runtimeEnv(), null);

    expect(settings.emailPasswordLoginEnabled).toBe(true);
    expect(settings.externalProviders).toEqual([]);
    expect(getMissingAppAuthSettings(settings)).toEqual(["auth_base_url"]);
    expect(isAppAuthRunnable(settings)).toBe(false);
  });

  it("resolves DB-managed auth secret, site address, initial admin, and SSO providers", () => {
    const settings = resolveAppAuthSettings(
      runtimeEnv({
        AUTH_INITIAL_ADMIN_EMAIL: "admin@example.com",
        AUTH_INITIAL_ADMIN_PASSWORD: "password123",
      }),
      {
        ...emptyRow(),
        auth_secret: "a".repeat(32),
        auth_base_url: "https://db.example.com",
        auth_trusted_origins: "https://db.example.com\nhttps://admin.example.com",
      },
      {
        rawEnv: { WORKSPACE_CLIENT_SECRET: "client-secret" },
        ssoProviders: [ssoProvider()],
      },
    );

    expect(settings).toMatchObject({
      secret: "a".repeat(32),
      baseUrl: "https://db.example.com",
      trustedOrigins: ["https://db.example.com", "https://admin.example.com"],
      emailPasswordLoginEnabled: true,
      externalProviders: [
        expect.objectContaining({
          providerId: "workspace",
          name: "Workspace",
          buttonLabel: "Sign in with Workspace",
          logoUrl: "https://login.example.com/logo.png",
          protocol: "oidc",
          discoveryUrl: "https://login.example.com/.well-known/openid-configuration",
          authorizationUrl: "",
          tokenUrl: "",
          userInfoUrl: "",
          clientId: "client-id",
          clientSecret: "client-secret",
          clientSecretRef: "env:WORKSPACE_CLIENT_SECRET",
          scopes: ["openid", "email", "profile", "groups"],
        }),
      ],
      initialAdmin: {
        email: "admin@example.com",
        password: "password123",
        name: "Initial Admin",
      },
    });
    expect(getMissingAppAuthSettings(settings)).toEqual([]);
    expect(isAppAuthRunnable(settings)).toBe(true);
  });

  it("reflects the DB email/password policy", () => {
    const settings = resolveAppAuthSettings(
      runtimeEnv(),
      { ...emptyRow(), auth_secret: "a".repeat(32), auth_base_url: "https://app.example.com", auth_email_password_login_enabled: false },
      { ssoProviders: [ssoProvider()] },
    );

    expect(settings.emailPasswordLoginEnabled).toBe(false);
    expect(isAppAuthRunnable(settings)).toBe(true);
  });

  it("does not use env fallback for SSO providers", () => {
    const settings = resolveAppAuthSettings(
      runtimeEnv({
        AUTH_INITIAL_ADMIN_EMAIL: "admin@example.com",
        AUTH_INITIAL_ADMIN_PASSWORD: "password123",
      }),
      { ...emptyRow(), auth_secret: "a".repeat(32), auth_base_url: "https://app.example.com" },
    );

    expect(settings.externalProviders).toEqual([]);
  });

  it("resolves SSO client secret references from the runtime environment", () => {
    const settings = resolveAppAuthSettings(
      runtimeEnv(),
      { ...emptyRow(), auth_secret: "a".repeat(32), auth_base_url: "https://app.example.com" },
      {
        rawEnv: { WORKSPACE_CLIENT_SECRET: "resolved-client-secret" },
        ssoProviders: [
          ssoProvider({
            clientSecretRef: "env:WORKSPACE_CLIENT_SECRET",
            clientSecretConfigured: true,
          }),
        ],
      },
    );

    expect(settings.externalProviders[0]).toMatchObject({
      clientSecret: "resolved-client-secret",
      clientSecretRef: "env:WORKSPACE_CLIENT_SECRET",
    });
  });

  it("leaves the runtime SSO secret empty when a configured reference cannot be resolved", () => {
    const settings = resolveAppAuthSettings(
      runtimeEnv(),
      { ...emptyRow(), auth_secret: "a".repeat(32), auth_base_url: "https://app.example.com" },
      {
        rawEnv: {},
        ssoProviders: [
          ssoProvider({
            clientSecretRef: "env:MISSING_WORKSPACE_CLIENT_SECRET",
            clientSecretConfigured: true,
          }),
        ],
      },
    );

    expect(settings.externalProviders[0]).toMatchObject({
      clientSecret: "",
      clientSecretRef: "env:MISSING_WORKSPACE_CLIENT_SECRET",
    });
  });

  it("normalizes enabled SSO providers with missing optional credentials to blank runtime config values", () => {
    const settings = resolveAppAuthSettings(
      runtimeEnv(),
      { ...emptyRow(), auth_secret: "a".repeat(32), auth_base_url: "https://app.example.com" },
      {
        ssoProviders: [
          ssoProvider({
            logoUrl: null,
            discoveryUrl: null,
            clientId: null,
            clientSecretRef: null,
            clientSecretConfigured: false,
          }),
        ],
      },
    );

    expect(settings.externalProviders[0]).toMatchObject({
      logoUrl: undefined,
      discoveryUrl: "",
      authorizationUrl: "",
      tokenUrl: "",
      userInfoUrl: "",
      clientId: "",
      clientSecret: "",
    });
  });

  it("splits blank external provider scopes as an empty list", () => {
    expect(splitScopeList(null)).toEqual([]);
    expect(splitScopeList("")).toEqual([]);
  });

  it("maps external provider profiles to admin only through provider-scoped rules", () => {
    const base = resolveAppAuthSettings(
      runtimeEnv(),
      { ...emptyRow(), auth_secret: "a".repeat(32), auth_base_url: "https://app.example.com" },
      {
        rawEnv: { WORKSPACE_CLIENT_SECRET: "client-secret" },
        ssoProviders: [ssoProvider()],
      },
    );

    expect(resolveExternalProfileRole({ email: "other@example.com", groups: ["ops"] }, base, "workspace")).toBe("admin");
    expect(resolveExternalProfileRole({ email: "other@example.com", groups: "staff, ops" }, base, "workspace")).toBe("admin");
    expect(resolveExternalProfileRole({ email: "admin@example.com" }, base, "workspace")).toBe("admin");
    expect(resolveExternalProfileRole({ email: "admin@example.com" }, base, "other")).toBe("user");
    expect(resolveExternalProfileRole(null, base, "workspace")).toBe("user");
    expect(resolveExternalProfileRole(["ops"], base, "workspace")).toBe("user");
    expect(resolveExternalProfileRole({ email: true, groups: 42 }, base, "workspace")).toBe("user");
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
    auth_email_password_login_enabled: true,
  };
}

function ssoProvider(overrides: Partial<SsoProviderRecord> = {}): SsoProviderRecord {
  return {
    id: "provider-id",
    providerId: "workspace",
    displayName: "Workspace",
    buttonLabel: "Sign in with Workspace",
    logoUrl: "https://login.example.com/logo.png",
    protocol: "oidc",
    preset: "custom_oidc",
    discoveryUrl: "https://login.example.com/.well-known/openid-configuration",
    authorizationUrl: null,
    tokenUrl: null,
    userInfoUrl: null,
    clientId: "client-id",
    clientSecretRef: "env:WORKSPACE_CLIENT_SECRET",
    clientSecretConfigured: true,
    scopes: ["openid", "email", "profile", "groups"],
    enabled: true,
    sortOrder: 0,
    adminRules: [
      { id: "rule-1", type: "email_allowlist", value: "admin@example.com" },
      { id: "rule-2", type: "claim_equals", value: "groups=ops" },
    ],
    createdAt: "2026-06-19T00:00:00.000Z",
    updatedAt: "2026-06-19T00:00:00.000Z",
    ...overrides,
  };
}
