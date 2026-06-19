import { describe, expect, it } from "vitest";
import { loadRuntimeEnv } from "@/lib/env";
import type { SsoProviderRecord } from "@/lib/auth/sso-provider-repository";
import { serviceSettingColumns, settingDefinitions, type ServiceSettingsRow } from "./descriptors";
import { buildSettingsResponse } from "./response";
import { validateSettingsPatch } from "./validation";

function runtimeEnv(overrides: Record<string, string | boolean | number | undefined> = {}) {
  return loadRuntimeEnv({
    DATABASE_URL: "postgres://user:pass@localhost:5432/app",
    ...overrides,
  });
}

describe("settings response and validation", () => {
  it("resolves saved settings, runtime fallback, defaults, unset values, and masked secrets", () => {
    const env = runtimeEnv({
      DATABASE_URL: "postgres://user:pass@localhost:5432/app",
      AUTH_SECRET: "x".repeat(32),
      AUTH_BASE_URL: "https://runtime.example.test",
      JUNO_LOGIN_PASSWORD: "runtime-password",
    });
    const response = buildSettingsResponse({
      env,
      rawEnv: {
        DATABASE_URL: "postgres://user:pass@localhost:5432/app",
        AUTH_SECRET: "x".repeat(32),
        AUTH_BASE_URL: "https://runtime.example.test",
        JUNO_LOGIN_PASSWORD: "runtime-password",
      },
      settingsRow: {
        ...emptySettingsRow(),
        auth_base_url: "https://database.example.test",
      },
      nodeEnv: "development",
      mailSources: [mailSource()],
    });

    expect(descriptor(response, "auth_base_url")).toMatchObject({
      source: "database",
      displayValue: "https://database.example.test",
      value: "https://database.example.test",
    });
    expect(descriptor(response, "juno_login_password")).toMatchObject({
      source: "runtime",
      displayValue: "Runtime fallback configured",
      value: null,
      secret: true,
    });
    expect(descriptor(response, "juno_login_email")).toMatchObject({
      source: "unset",
      state: "disabled",
    });
    expect(response.units.mail.status).toBe("ready");
    expect(JSON.stringify(response)).not.toContain("raw-service-account-json");
    expect(JSON.stringify(response)).not.toContain("runtime-password");
    expect(JSON.stringify(response)).not.toContain("AUTH_SECRET");
    expect(JSON.stringify(response)).not.toContain("auth_secret");
    expect(response.nextActions.map((action) => action.id)).toContain("review-read-only-boundary");
  });

  it("derives the auth provider callback URL from the configured site address and masks provider secrets", () => {
    const env = runtimeEnv({
      DATABASE_URL: "postgres://user:pass@localhost:5432/app",
      AUTH_SECRET: "x".repeat(32),
      AUTH_BASE_URL: "https://runtime.example.test",
    });
    const response = buildSettingsResponse({
      env,
      rawEnv: {
        DATABASE_URL: "postgres://user:pass@localhost:5432/app",
        AUTH_SECRET: "x".repeat(32),
        AUTH_BASE_URL: "https://runtime.example.test",
      },
      settingsRow: {
        ...emptySettingsRow(),
        auth_base_url: "https://inventory-dev.example.test",
      },
      nodeEnv: "development",
      currentRequestOrigin: "https://inventory-dev.example.test",
      adminUserCount: 1,
      ssoProviders: [ssoProvider()],
    });

    expect(response.units.authProvider).toMatchObject({
      status: "ready",
      providerCount: 1,
      enabledProviderCount: 1,
      readyProviderCount: 1,
    });
    expect(response.units.authProvider.providers[0]).toMatchObject({
      displayName: "Workspace",
      buttonLabel: "Sign in with Workspace",
      providerId: "workspace",
      clientSecretConfigured: true,
      callbackUrl: "https://inventory-dev.example.test/api/auth/oauth2/callback/workspace",
    });
    expect(JSON.stringify(response)).not.toContain("db-client-secret");
  });

  it("marks malformed external provider URLs invalid instead of ready", () => {
    const response = buildSettingsResponse({
      env: runtimeEnv(),
      rawEnv: {},
      settingsRow: {
        ...emptySettingsRow(),
        auth_base_url: "https://inventory-dev.example.test",
      },
      nodeEnv: "development",
      ssoProviders: [ssoProvider({ discoveryUrl: "not-a-url" })],
    });

    expect(response.units.authProvider).toMatchObject({
      status: "invalid",
    });
    expect(response.units.authProvider.providers[0]).toMatchObject({
      status: "invalid",
      invalid: ["discovery URL"],
      callbackUrl: "https://inventory-dev.example.test/api/auth/oauth2/callback/workspace",
    });
  });

  it("treats mail sources as optional in demo mode and required in real mailbox mode", () => {
    const env = runtimeEnv({
      DATABASE_URL: "postgres://user:pass@localhost:5432/app",
    });

    const demo = buildSettingsResponse({
      env,
      rawEnv: {},
      settingsRow: emptySettingsRow(),
      nodeEnv: "development",
    });
    expect(demo.dataMode.value).toBe("demo");
    expect(demo.units.mail).toMatchObject({ status: "disabled", configured: false });

    const realMailbox = buildSettingsResponse({
      env,
      rawEnv: {},
      settingsRow: { ...emptySettingsRow(), data_mode: "real_mailbox" },
      nodeEnv: "development",
    });
    expect(realMailbox.dataMode.value).toBe("real_mailbox");
    expect(realMailbox.units.mail).toMatchObject({ status: "missing", configured: false });

    const configured = buildSettingsResponse({
      env,
      rawEnv: {},
      settingsRow: { ...emptySettingsRow(), data_mode: "real_mailbox" },
      nodeEnv: "development",
      mailSources: [mailSource()],
    });
    expect(configured.units.mail).toMatchObject({ status: "ready", configured: true });
  });

  it("blocks auth bootstrap when no admin access path exists", () => {
    const blocked = buildSettingsResponse({
      env: runtimeEnv({
        AUTH_SECRET: "x".repeat(32),
        AUTH_BASE_URL: "https://app.example.test",
      }),
      rawEnv: {},
      settingsRow: emptySettingsRow(),
      nodeEnv: "production",
      adminUserCount: 0,
    });
    expect(blocked.security.authBootstrap).toMatchObject({
      status: "blocked",
      detail: "Auth bootstrap blocked. No admin access path configured.",
    });

    const existingAdmin = buildSettingsResponse({
      env: runtimeEnv({
        AUTH_SECRET: "x".repeat(32),
        AUTH_BASE_URL: "https://app.example.test",
      }),
      rawEnv: {},
      settingsRow: emptySettingsRow(),
      nodeEnv: "production",
      adminUserCount: 1,
    });
    expect(existingAdmin.security.authBootstrap).toMatchObject({
      status: "ready",
      detail: "At least one admin user exists.",
    });

    const allowlist = buildSettingsResponse({
      env: runtimeEnv({
        AUTH_SECRET: "x".repeat(32),
        AUTH_BASE_URL: "https://app.example.test",
      }),
      rawEnv: {},
      settingsRow: emptySettingsRow(),
      nodeEnv: "production",
      adminUserCount: 0,
      ssoProviders: [
        ssoProvider({
          adminRules: [{ id: "rule-1", type: "email_allowlist", value: "admin@example.test" }],
        }),
      ],
    });
    expect(allowlist.security.authBootstrap).toMatchObject({
      status: "ready",
      hasExternalAdminMapping: true,
    });
  });

  it("warns when configured site address or trusted origins do not match the current origin", () => {
    const response = buildSettingsResponse({
      env: runtimeEnv({
        AUTH_SECRET: "x".repeat(32),
        AUTH_BASE_URL: "https://configured.example.test",
        AUTH_TRUSTED_ORIGINS: "https://configured.example.test",
      }),
      rawEnv: {},
      settingsRow: emptySettingsRow(),
      nodeEnv: "development",
      currentRequestOrigin: "https://inventory-dev.example.test",
      adminUserCount: 1,
    });

    expect(response.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "auth_base_url_origin_mismatch", severity: "warning" }),
        expect.objectContaining({ id: "auth_trusted_origin_missing_current", severity: "warning" }),
      ]),
    );
  });

  it("validates patch semantics and unsafe settings", () => {
    const env = runtimeEnv({
      DATABASE_URL: "postgres://user:pass@localhost:5432/app",
      AUTH_SECRET: "x".repeat(32),
    });

    const secretNoop = validateSettingsPatch({
      input: { juno: { juno_login_password: "" } },
      currentRow: { ...emptySettingsRow(), juno_login_password: "db-secret" },
      env,
      rawEnv: {},
      nodeEnv: "development",
    });
    expect(secretNoop).toMatchObject({ ok: true, changed: [], patch: {} });

    const clearSecret = validateSettingsPatch({
      input: { juno: { juno_login_password: null } },
      currentRow: { ...emptySettingsRow(), juno_login_password: "db-secret" },
      env,
      rawEnv: {},
      nodeEnv: "development",
    });
    expect(clearSecret).toMatchObject({ ok: true, changed: ["juno_login_password"], patch: { juno_login_password: null } });

    expect(
      validateSettingsPatch({
        input: { juno: { juno_live_delay_min_ms: 20, juno_live_delay_max_ms: 10 } },
        currentRow: emptySettingsRow(),
        env,
        rawEnv: {},
        nodeEnv: "development",
      }),
    ).toMatchObject({
      ok: false,
      issues: ["juno_live_delay_min_ms must be <= juno_live_delay_max_ms"],
    });

    expect(
      validateSettingsPatch({
        input: { auth: { auth_base_url: "not-a-url" } },
        currentRow: emptySettingsRow(),
        env,
        rawEnv: {},
        nodeEnv: "development",
      }),
    ).toMatchObject({
      ok: false,
      issues: ["auth_base_url: must be a valid URL"],
    });

    expect(
      validateSettingsPatch({
        input: { auth: { auth_login_logo_url: "https://assets.example.test/login-logo.webp?version=1" } },
        currentRow: emptySettingsRow(),
        env,
        rawEnv: {},
        nodeEnv: "development",
      }),
    ).toMatchObject({
      ok: true,
      changed: ["auth_login_logo_url"],
      patch: { auth_login_logo_url: "https://assets.example.test/login-logo.webp?version=1" },
    });

    expect(
      validateSettingsPatch({
        input: { auth: { auth_login_logo_url: "https://assets.example.test/login-logo.jpg" } },
        currentRow: emptySettingsRow(),
        env,
        rawEnv: {},
        nodeEnv: "development",
      }),
    ).toMatchObject({
      ok: false,
      issues: ["auth_login_logo_url: must be an http(s) URL ending in .png, .webp, or .svg"],
    });

    expect(
      validateSettingsPatch({
        input: {
          mail: { legacy_mail_setting: "not-supported" },
          juno: { juno_live_concurrency: 11, juno_live_poll_interval_ms: 0 },
        },
        currentRow: emptySettingsRow(),
        env,
        rawEnv: {},
        nodeEnv: "production",
      }),
    ).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        "legacy_mail_setting is not an editable setting",
        "juno_live_concurrency must be between 1 and 10",
        "juno_live_poll_interval_ms must be null or a positive integer",
      ]),
    });
  });

  it("covers every editable service_setting column with a descriptor while keeping internal columns out of Settings Center", () => {
    const described = new Set(settingDefinitions.map((definition) => definition.rowColumn).filter(Boolean));
    const internalColumns = new Set(["auth_secret"]);
    expect(described).toEqual(new Set(serviceSettingColumns.filter((column) => !internalColumns.has(column))));
    expect(settingDefinitions.some((definition) => definition.rowColumn === "auth_secret")).toBe(false);
  });
});

function descriptor(response: ReturnType<typeof buildSettingsResponse>, key: string) {
  const setting = response.groups.find((group) => group.id === "advanced")?.settings.find((entry) => entry.key === key);
  if (!setting) {
    throw new Error(`Missing descriptor ${key}`);
  }
  return setting;
}

function ssoProvider(overrides: Partial<SsoProviderRecord> = {}): SsoProviderRecord {
  return {
    id: "provider-id",
    providerId: "workspace",
    displayName: "Workspace",
    buttonLabel: "Sign in with Workspace",
    logoUrl: null,
    discoveryUrl: "https://login.example.test/.well-known/openid-configuration",
    clientId: "client-id",
    clientSecret: "db-client-secret",
    clientSecretConfigured: true,
    scopes: ["openid", "email", "profile"],
    enabled: true,
    sortOrder: 0,
    adminRules: [],
    createdAt: "2026-06-19T00:00:00.000Z",
    updatedAt: "2026-06-19T00:00:00.000Z",
    ...overrides,
  };
}

function emptySettingsRow(): ServiceSettingsRow {
  return {
    data_mode: null,
    juno_live_enqueue_on_ingest: null,
    juno_login_email: null,
    juno_login_password: null,
    juno_browser_profile_dir: null,
    juno_browser_headless: null,
    juno_live_concurrency: null,
    juno_live_delay_min_ms: null,
    juno_live_delay_max_ms: null,
    juno_live_nav_timeout_ms: null,
    juno_live_max_attempts: null,
    juno_live_poll_interval_ms: null,
    juno_live_auto_enqueue_on_interval: null,
    juno_live_auto_enqueue_limit: null,
    auth_secret: null,
    auth_base_url: null,
    auth_trusted_origins: null,
    auth_email_password_login_enabled: true,
    auth_login_logo_url: null,
    updated_at: null,
  };
}

function mailSource() {
  return {
    id: "source-1",
    connectionId: "connection-1",
    name: "Gmail source",
    provider: "gmail" as const,
    authType: "google_workspace_delegation" as const,
    credentialType: "google_service_account_json" as const,
    credentialReference: null,
    credentialConfigured: true,
    scopes: "https://www.googleapis.com/auth/gmail.readonly",
    mailboxAddress: "operator@example.test",
    displayName: "Operator",
    query: "filename:xlsx",
    maxResults: 25,
    lookbackMs: 604800000,
    processedLabel: "Processed",
    storageDir: ".data/mail",
    attachmentPattern: "xlsx",
    supplierCode: "juno",
    isActive: true,
  };
}
