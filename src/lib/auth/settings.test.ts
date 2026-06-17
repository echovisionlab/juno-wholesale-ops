import { describe, expect, it } from "vitest";
import { loadRuntimeEnv } from "@/lib/env";
import {
  getMissingAppAuthSettings,
  isAppAuthRunnable,
  resolveAppAuthSettings,
  splitList,
  type AuthServiceSettingsRow,
} from "./settings";

describe("resolveAppAuthSettings", () => {
  it("defaults to disabled auth with local email/password available when enabled later", () => {
    const settings = resolveAppAuthSettings(loadRuntimeEnv({}), null);

    expect(settings.enabled).toBe(false);
    expect(settings.emailPasswordEnabled).toBe(true);
    expect(settings.externalProvider).toBeNull();
    expect(getMissingAppAuthSettings(settings)).toEqual([]);
    expect(isAppAuthRunnable(settings)).toBe(true);
  });

  it("resolves complete env-based external provider settings", () => {
    const settings = resolveAppAuthSettings(
      loadRuntimeEnv({
        AUTH_ENABLED: "true",
        AUTH_SECRET: "a".repeat(32),
        AUTH_BASE_URL: "https://app.example.com",
        AUTH_TRUSTED_ORIGINS: "https://app.example.com\nhttps://admin.example.com",
        AUTH_EMAIL_PASSWORD_ENABLED: "false",
        AUTH_EXTERNAL_PROVIDER_ENABLED: "true",
        AUTH_EXTERNAL_PROVIDER_ID: "workspace",
        AUTH_EXTERNAL_PROVIDER_NAME: "Workspace",
        AUTH_EXTERNAL_DISCOVERY_URL: "https://login.example.com/.well-known/openid-configuration",
        AUTH_EXTERNAL_CLIENT_ID: "client-id",
        AUTH_EXTERNAL_CLIENT_SECRET: "client-secret",
        AUTH_INITIAL_ADMIN_EMAIL: "admin@example.com",
        AUTH_INITIAL_ADMIN_PASSWORD: "password123",
      }),
      null,
    );

    expect(settings).toMatchObject({
      enabled: true,
      secret: "a".repeat(32),
      baseUrl: "https://app.example.com",
      trustedOrigins: ["https://app.example.com", "https://admin.example.com"],
      emailPasswordEnabled: false,
      externalProviderEnabled: true,
      externalProvider: {
        providerId: "workspace",
        name: "Workspace",
        discoveryUrl: "https://login.example.com/.well-known/openid-configuration",
        clientId: "client-id",
        clientSecret: "client-secret",
      },
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
      loadRuntimeEnv({
        AUTH_ENABLED: "false",
        AUTH_SECRET: "a".repeat(32),
        AUTH_BASE_URL: "https://env.example.com",
        AUTH_EMAIL_PASSWORD_ENABLED: "true",
        AUTH_EXTERNAL_PROVIDER_ENABLED: "false",
      }),
      {
        ...emptyRow(),
        auth_enabled: true,
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

    expect(settings.enabled).toBe(true);
    expect(settings.baseUrl).toBe("https://db.example.com");
    expect(settings.emailPasswordEnabled).toBe(false);
    expect(settings.externalProvider).toMatchObject({
      providerId: "oidc",
      name: "OIDC",
      clientId: "db-client",
    });
  });

  it("reports missing runnable auth settings only when auth is enabled", () => {
    const settings = resolveAppAuthSettings(
      loadRuntimeEnv({
        AUTH_ENABLED: "true",
        AUTH_EMAIL_PASSWORD_ENABLED: "false",
        AUTH_EXTERNAL_PROVIDER_ENABLED: "true",
      }),
      null,
    );

    expect(getMissingAppAuthSettings(settings)).toEqual([
      "AUTH_SECRET",
      "auth_base_url",
      "auth_external_provider_id",
      "auth_external_discovery_url",
      "auth_external_client_id",
      "auth_external_client_secret",
    ]);
    expect(isAppAuthRunnable(settings)).toBe(false);
  });

  it("reports when auth is enabled without any sign-in method", () => {
    const settings = resolveAppAuthSettings(
      loadRuntimeEnv({
        AUTH_ENABLED: "true",
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
});

describe("splitList", () => {
  it("splits comma and newline separated lists", () => {
    expect(splitList(" one,\ntwo ,, three ")).toEqual(["one", "two", "three"]);
    expect(splitList(null)).toEqual([]);
  });
});

function emptyRow(): AuthServiceSettingsRow {
  return {
    auth_enabled: null,
    auth_base_url: null,
    auth_trusted_origins: null,
    auth_email_password_enabled: null,
    auth_external_provider_enabled: null,
    auth_external_provider_id: null,
    auth_external_provider_name: null,
    auth_external_discovery_url: null,
    auth_external_client_id: null,
    auth_external_client_secret: null,
  };
}
