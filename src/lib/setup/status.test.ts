import { describe, expect, it } from "vitest";
import { loadRuntimeEnv } from "@/lib/env";
import type { SsoProviderRecord } from "@/lib/auth/sso-provider-repository";
import type { PublicMailboxSource } from "@/lib/ingest/mail-source";
import type { JunoLiveServiceSettingsRow } from "@/lib/juno-live/settings";
import { buildAppSetupStatus } from "./status";

function runtimeEnv(overrides: Record<string, string | boolean | number | undefined> = {}) {
  return loadRuntimeEnv({
    DATABASE_URL: "postgres://user:pass@localhost:5432/app",
    ...overrides,
  });
}

describe("buildAppSetupStatus", () => {
  it("marks a fresh install as missing only required operator settings after runtime database validation", () => {
    const status = buildAppSetupStatus({
      env: runtimeEnv(),
      settingsRow: null,
      mailSources: [],
    });

    expect(status.ready).toBe(false);
    expect(status.steps).toEqual([
      expect.objectContaining({
        id: "database",
        state: "warning",
        missing: [],
        settings: expect.arrayContaining([
          expect.objectContaining({
            key: "DATABASE_URL",
            source: "runtime",
            state: "configured",
            value: "configured",
          }),
        ]),
      }),
      expect.objectContaining({ id: "data", state: "warning", missing: [] }),
      expect.objectContaining({ id: "mail", state: "warning", missing: [] }),
      expect.objectContaining({ id: "juno", state: "warning", missing: [] }),
      expect.objectContaining({ id: "auth", state: "missing", missing: ["auth_base_url"] }),
    ]);
    expect(JSON.stringify(status)).not.toContain("AUTH_SECRET");
  });

  it("does not require mail sources in demo mode", () => {
    const status = buildAppSetupStatus({
      env: runtimeEnv({ AUTH_BASE_URL: "https://app.example.com" }),
      settingsRow: emptyRow(),
      adminUserCount: 1,
      mailSources: [],
    });

    expect(status.ready).toBe(true);
    expect(status.steps.find((step) => step.id === "mail")).toEqual(
      expect.objectContaining({
        state: "warning",
        missing: [],
        detail: "optional while demo mode is selected",
      }),
    );
  });

  it("requires a runnable mail source in real mailbox mode", () => {
    const missing = buildAppSetupStatus({
      env: runtimeEnv({ JUNO_WHOLESALE_OPS_DATA_MODE: "real_mailbox", AUTH_BASE_URL: "https://app.example.com" }),
      settingsRow: emptyRow(),
      adminUserCount: 1,
      mailSources: [],
    });
    expect(missing.ready).toBe(false);
    expect(missing.steps.find((step) => step.id === "mail")).toEqual(
      expect.objectContaining({ state: "missing", missing: ["mail_source"] }),
    );

    const configured = buildAppSetupStatus({
      env: runtimeEnv({ JUNO_WHOLESALE_OPS_DATA_MODE: "real_mailbox", AUTH_BASE_URL: "https://app.example.com" }),
      settingsRow: emptyRow(),
      adminUserCount: 1,
      mailSources: [mailSource()],
    });
    expect(configured.steps.find((step) => step.id === "mail")).toEqual(
      expect.objectContaining({
        state: "complete",
        missing: [],
        settings: expect.arrayContaining([
          expect.objectContaining({ key: "runnable_gmail_sources", value: "1" }),
          expect.objectContaining({ key: "credential_state", value: "configured", secret: true }),
        ]),
      }),
    );
  });

  it("keeps Juno live lookup optional until lookup controls are enabled", () => {
    const status = buildAppSetupStatus({
      env: runtimeEnv({ AUTH_BASE_URL: "https://app.example.com" }),
      settingsRow: emptyRow(),
      adminUserCount: 1,
    });

    expect(status.ready).toBe(true);
    expect(status.steps.find((step) => step.id === "juno")).toEqual(
      expect.objectContaining({
        state: "warning",
        missing: [],
        guardrails: expect.arrayContaining([
          expect.objectContaining({ label: "Read-only browser lookup", state: "warning" }),
        ]),
      }),
    );
  });

  it("blocks Juno live lookup when enabled without credentials", () => {
    const status = buildAppSetupStatus({
      env: runtimeEnv({ AUTH_BASE_URL: "https://app.example.com", JUNO_LIVE_POLL_INTERVAL_MS: "300000" }),
      settingsRow: emptyRow(),
      adminUserCount: 1,
    });

    expect(status.ready).toBe(false);
    expect(status.steps.find((step) => step.id === "juno")).toEqual(
      expect.objectContaining({
        state: "missing",
        missing: ["juno_login_email", "juno_login_password"],
      }),
    );
  });

  it("blocks setup when the Juno live delay window is unsafe", () => {
    const status = buildAppSetupStatus({
      env: runtimeEnv({
        AUTH_BASE_URL: "https://app.example.com",
        JUNO_LIVE_DELAY_MIN_MS: "2000",
        JUNO_LIVE_DELAY_MAX_MS: "1000",
      }),
      settingsRow: emptyRow(),
      adminUserCount: 1,
    });

    expect(status.ready).toBe(false);
    expect(status.steps.find((step) => step.id === "juno")).toEqual(
      expect.objectContaining({
        state: "missing",
        missing: ["juno_live_delay_min_ms must be <= juno_live_delay_max_ms"],
        guardrails: expect.arrayContaining([
          expect.objectContaining({
            label: "Randomized request pacing",
            state: "blocked",
            detail: "Minimum delay is greater than maximum delay.",
          }),
        ]),
      }),
    );
  });

  it("formats scheduled polling guardrails", () => {
    const status = buildAppSetupStatus({
      env: runtimeEnv({
        AUTH_BASE_URL: "https://app.example.com",
        JUNO_LOGIN_EMAIL: "buyer@example.com",
        JUNO_LOGIN_PASSWORD: "secret",
        JUNO_LIVE_POLL_INTERVAL_MS: "120000",
        JUNO_LIVE_AUTO_ENQUEUE_ON_INTERVAL: "true",
      }),
      settingsRow: emptyRow(),
      adminUserCount: 1,
    });

    expect(status.steps.find((step) => step.id === "juno")?.guardrails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Scheduled polling",
          state: "ok",
          detail: "Automatic lookup is enabled every 2 minutes.",
        }),
      ]),
    );
  });

  it("formats singular and plural hour/minute scheduled polling intervals", () => {
    const oneHour = buildAppSetupStatus({
      env: runtimeEnv({
        AUTH_BASE_URL: "https://app.example.com",
        JUNO_LOGIN_EMAIL: "buyer@example.com",
        JUNO_LOGIN_PASSWORD: "secret",
        JUNO_LIVE_POLL_INTERVAL_MS: "3600000",
        JUNO_LIVE_AUTO_ENQUEUE_ON_INTERVAL: "true",
      }),
      settingsRow: emptyRow(),
      adminUserCount: 1,
    });
    const twoHours = buildAppSetupStatus({
      env: runtimeEnv({
        AUTH_BASE_URL: "https://app.example.com",
        JUNO_LOGIN_EMAIL: "buyer@example.com",
        JUNO_LOGIN_PASSWORD: "secret",
        JUNO_LIVE_POLL_INTERVAL_MS: "7200000",
        JUNO_LIVE_AUTO_ENQUEUE_ON_INTERVAL: "true",
      }),
      settingsRow: emptyRow(),
      adminUserCount: 1,
    });
    const oneMinute = buildAppSetupStatus({
      env: runtimeEnv({
        AUTH_BASE_URL: "https://app.example.com",
        JUNO_LOGIN_EMAIL: "buyer@example.com",
        JUNO_LOGIN_PASSWORD: "secret",
        JUNO_LIVE_POLL_INTERVAL_MS: "60000",
        JUNO_LIVE_AUTO_ENQUEUE_ON_INTERVAL: "true",
      }),
      settingsRow: emptyRow(),
      adminUserCount: 1,
    });

    expect(oneHour.steps.find((step) => step.id === "juno")?.guardrails).toEqual(
      expect.arrayContaining([expect.objectContaining({ detail: "Automatic lookup is enabled every 1 hour." })]),
    );
    expect(twoHours.steps.find((step) => step.id === "juno")?.guardrails).toEqual(
      expect.arrayContaining([expect.objectContaining({ detail: "Automatic lookup is enabled every 2 hours." })]),
    );
    expect(oneMinute.steps.find((step) => step.id === "juno")?.guardrails).toEqual(
      expect.arrayContaining([expect.objectContaining({ detail: "Automatic lookup is enabled every 1 minute." })]),
    );
  });

  it("marks scheduled polling blocked when automatic enqueue has no credentials", () => {
    const status = buildAppSetupStatus({
      env: runtimeEnv({
        AUTH_BASE_URL: "https://app.example.com",
        JUNO_LIVE_POLL_INTERVAL_MS: "1234",
        JUNO_LIVE_AUTO_ENQUEUE_ON_INTERVAL: "true",
      }),
      settingsRow: emptyRow(),
      adminUserCount: 1,
    });

    expect(status.steps.find((step) => step.id === "juno")?.guardrails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Scheduled polling",
          state: "blocked",
          detail: "Automatic enqueue is enabled, but credentials are missing.",
        }),
      ]),
    );
  });

  it("formats millisecond scheduled polling when interval is not minute aligned", () => {
    const status = buildAppSetupStatus({
      env: runtimeEnv({
        AUTH_BASE_URL: "https://app.example.com",
        JUNO_LOGIN_EMAIL: "buyer@example.com",
        JUNO_LOGIN_PASSWORD: "secret",
        JUNO_LIVE_POLL_INTERVAL_MS: "1234",
        JUNO_LIVE_AUTO_ENQUEUE_ON_INTERVAL: "true",
      }),
      settingsRow: emptyRow(),
      adminUserCount: 1,
    });

    expect(status.steps.find((step) => step.id === "juno")?.guardrails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Scheduled polling",
          state: "ok",
          detail: "Automatic lookup is enabled every 1234 ms.",
        }),
      ]),
    );
  });

  it("blocks auth bootstrap when no admin access path exists", () => {
    const blocked = buildAppSetupStatus({
      env: runtimeEnv({ AUTH_BASE_URL: "https://app.example.com" }),
      settingsRow: emptyRow(),
      adminUserCount: 0,
    });
    expect(blocked.steps.find((step) => step.id === "auth")?.guardrails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Admin bootstrap", state: "blocked" }),
      ]),
    );

    const withInitialAdmin = buildAppSetupStatus({
      env: runtimeEnv({
        AUTH_BASE_URL: "https://app.example.com",
        AUTH_INITIAL_ADMIN_EMAIL: "admin@example.com",
        AUTH_INITIAL_ADMIN_PASSWORD: "password123",
      }),
      settingsRow: emptyRow(),
      adminUserCount: 0,
    });
    expect(withInitialAdmin.steps.find((step) => step.id === "auth")?.guardrails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Admin bootstrap", state: "ok" }),
      ]),
    );

    const withExternalMapping = buildAppSetupStatus({
      env: runtimeEnv({
        AUTH_BASE_URL: "https://app.example.com",
      }),
      settingsRow: emptyRow(),
      adminUserCount: 0,
      ssoProviders: [
        ssoProvider({
          adminRules: [{ id: "rule-1", type: "claim_equals", value: "groups=ops-admin" }],
        }),
      ],
    });
    expect(withExternalMapping.steps.find((step) => step.id === "auth")?.guardrails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Admin bootstrap",
          state: "ok",
          detail: "External provider admin allowlist or claim mapping can bootstrap admin access.",
        }),
      ]),
    );
  });

  it("surfaces database and runtime setting sources without raw secrets", () => {
    const status = buildAppSetupStatus({
      env: runtimeEnv({
        AUTH_BASE_URL: "https://app.example.com",
        JUNO_LOGIN_PASSWORD: "runtime-secret",
      }),
      settingsRow: {
        ...emptyRow(),
        juno_login_email: "buyer@example.com",
        juno_live_poll_interval_ms: 3600000,
        auth_email_password_login_enabled: false,
      },
      adminUserCount: 1,
    });

    expect(status.steps.find((step) => step.id === "juno")?.settings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "juno_login_email", source: "database", value: "buyer@example.com" }),
        expect.objectContaining({ key: "juno_login_password", source: "runtime", value: "configured", secret: true }),
      ]),
    );
    expect(status.steps.find((step) => step.id === "auth")?.settings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "auth_email_password_login_enabled", source: "database", value: "disabled" }),
      ]),
    );
    expect(JSON.stringify(status)).not.toContain("runtime-secret");
  });
});

function emptyRow(): JunoLiveServiceSettingsRow {
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
  };
}

function ssoProvider(overrides: Partial<SsoProviderRecord> = {}): SsoProviderRecord {
  return {
    id: "provider-id",
    providerId: "workspace",
    displayName: "Workspace",
    buttonLabel: "Continue with Workspace",
    logoUrl: null,
    discoveryUrl: "https://login.example.test/.well-known/openid-configuration",
    clientId: "client-id",
    clientSecret: "client-secret",
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

function mailSource(): PublicMailboxSource {
  return {
    id: "source-1",
    connectionId: "connection-1",
    name: "Gmail source",
    provider: "gmail",
    authType: "google_workspace_delegation",
    credentialType: "google_service_account_json",
    credentialReference: null,
    credentialConfigured: true,
    scopes: "https://www.googleapis.com/auth/gmail.readonly",
    mailboxAddress: "operator@example.com",
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
