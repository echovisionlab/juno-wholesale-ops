import { describe, expect, it } from "vitest";
import { loadRuntimeEnv } from "@/lib/env";
import type { JunoLiveServiceSettingsRow } from "@/lib/juno-live/settings";
import { buildAppSetupStatus } from "./status";

describe("buildAppSetupStatus", () => {
  it("marks a fresh install as missing only required runtime settings", () => {
    const status = buildAppSetupStatus({
      env: loadRuntimeEnv({}),
      settingsRow: null,
    });

    expect(status.ready).toBe(false);
    expect(status.steps).toEqual([
      expect.objectContaining({
        id: "database",
        state: "missing",
        missing: ["DATABASE_URL"],
        settings: expect.arrayContaining([
          expect.objectContaining({
            key: "DATABASE_URL",
            source: "unset",
            state: "missing",
            value: "not set",
          }),
        ]),
        guardrails: expect.arrayContaining([
          expect.objectContaining({ label: "Persistent state", state: "blocked" }),
        ]),
      }),
      expect.objectContaining({
        id: "data",
        state: "warning",
        missing: [],
      }),
      expect.objectContaining({
        id: "gmail",
        state: "warning",
        missing: [],
      }),
      expect.objectContaining({
        id: "juno",
        state: "warning",
        missing: [],
        guardrails: expect.arrayContaining([
          expect.objectContaining({ label: "Read-only browser lookup", state: "warning" }),
          expect.objectContaining({ label: "Scheduled polling", state: "warning" }),
        ]),
      }),
      expect.objectContaining({
        id: "auth",
        state: "missing",
        missing: ["auth_base_url"],
      }),
    ]);
    expect(JSON.stringify(status)).not.toContain("AUTH_SECRET");
    expect(JSON.stringify(status)).not.toContain("Auth secret");
  });

  it("marks setup complete when values come from env and database settings", () => {
    const status = buildAppSetupStatus({
      env: loadRuntimeEnv({
        DATABASE_URL: "postgres://user:pass@localhost:5432/app",
        AUTH_BASE_URL: "https://app.example.com",
        AUTH_INITIAL_ADMIN_EMAIL: "admin@example.com",
        AUTH_INITIAL_ADMIN_PASSWORD: "password123",
        GOOGLE_WORKSPACE_DELEGATED_USER: "operator@example.com",
        GOOGLE_SERVICE_ACCOUNT_KEY_JSON: "/run/secrets/google.json",
      }),
      settingsRow: {
        ...emptyRow(),
        juno_login_email: "buyer@example.com",
        juno_login_password: "secret",
        juno_live_poll_interval_ms: 3600000,
        juno_live_auto_enqueue_on_interval: true,
      },
    });

    expect(status.ready).toBe(true);
    expect(status.steps.map((step) => step.state)).toEqual(["complete", "warning", "warning", "complete", "complete"]);
    expect(status.steps.find((step) => step.id === "juno")?.settings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "juno_login_email",
          source: "database",
          value: "buyer@example.com",
        }),
        expect.objectContaining({
          key: "juno_login_password",
          source: "database",
          value: "configured",
          secret: true,
        }),
      ]),
    );
  });

  it("does not require Gmail settings in demo mode", () => {
    const status = buildAppSetupStatus({
      env: loadRuntimeEnv({
        DATABASE_URL: "postgres://user:pass@localhost:5432/app",
        AUTH_BASE_URL: "https://app.example.com",
      }),
      settingsRow: emptyRow(),
    });

    expect(status.ready).toBe(true);
    expect(status.steps.find((step) => step.id === "gmail")).toEqual(
      expect.objectContaining({
        state: "warning",
        missing: [],
        detail: "optional while demo mode is selected",
      }),
    );
  });

  it("requires Gmail settings in real mailbox mode", () => {
    const status = buildAppSetupStatus({
      env: loadRuntimeEnv({
        DATABASE_URL: "postgres://user:pass@localhost:5432/app",
        JUNO_WHOLESALE_OPS_DATA_MODE: "real_mailbox",
        AUTH_BASE_URL: "https://app.example.com",
      }),
      settingsRow: emptyRow(),
    });

    expect(status.ready).toBe(false);
    expect(status.steps.find((step) => step.id === "gmail")).toEqual(
      expect.objectContaining({
        state: "missing",
        missing: ["google_workspace_delegated_user", "google_service_account_key_json"],
      }),
    );
  });

  it("does not block app setup for missing Juno credentials while live lookup is disabled", () => {
    const status = buildAppSetupStatus({
      env: loadRuntimeEnv({
        DATABASE_URL: "postgres://user:pass@localhost:5432/app",
        AUTH_BASE_URL: "https://app.example.com",
      }),
      settingsRow: emptyRow(),
    });

    expect(status.ready).toBe(true);
    expect(status.steps.find((step) => step.id === "juno")).toEqual(
      expect.objectContaining({
        state: "warning",
        missing: [],
      }),
    );
  });

  it("does not expose the internal auth secret in setup status", () => {
    const status = buildAppSetupStatus({
      env: loadRuntimeEnv({
        DATABASE_URL: "postgres://user:pass@localhost:5432/app",
        JUNO_LOGIN_EMAIL: "buyer@example.com",
        JUNO_LOGIN_PASSWORD: "secret",
      }),
      settingsRow: null,
    });

    expect(JSON.stringify(status)).not.toContain("AUTH_SECRET");
    expect(JSON.stringify(status)).not.toContain("Auth secret");
    expect(status.steps.at(-1)).toEqual(
      expect.objectContaining({
        id: "auth",
        state: "missing",
        missing: ["auth_base_url"],
      }),
    );
  });

  it("blocks auth when every sign-in method is explicitly disabled", () => {
    const status = buildAppSetupStatus({
      env: loadRuntimeEnv({
        DATABASE_URL: "postgres://user:pass@localhost:5432/app",
        AUTH_BASE_URL: "https://app.example.com",
        AUTH_EMAIL_PASSWORD_ENABLED: "false",
        AUTH_EXTERNAL_PROVIDER_ENABLED: "false",
        GOOGLE_WORKSPACE_DELEGATED_USER: "operator@example.com",
        GOOGLE_SERVICE_ACCOUNT_KEY_JSON: "/run/secrets/google.json",
        JUNO_LOGIN_EMAIL: "buyer@example.com",
        JUNO_LOGIN_PASSWORD: "secret",
      }),
      settingsRow: null,
    });

    expect(status.steps.find((step) => step.id === "auth")).toEqual(
      expect.objectContaining({
        state: "missing",
        missing: ["auth_email_password_enabled or auth_external_provider_enabled"],
        guardrails: expect.arrayContaining([
          expect.objectContaining({
            label: "Sign-in method",
            state: "blocked",
            detail: "Auth is always enabled, but every sign-in method is disabled.",
          }),
        ]),
      }),
    );
  });

  it("blocks auth when no admin access path is configured", () => {
    const status = buildAppSetupStatus({
      env: loadRuntimeEnv({
        DATABASE_URL: "postgres://user:pass@localhost:5432/app",
        AUTH_BASE_URL: "https://app.example.com",
      }),
      settingsRow: emptyRow(),
      adminUserCount: 0,
    });

    expect(status.steps.find((step) => step.id === "auth")?.guardrails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Admin bootstrap",
          state: "blocked",
          detail: "Auth bootstrap blocked. No admin access path configured.",
        }),
      ]),
    );
  });

  it("accepts external provider admin allowlist as an auth bootstrap path", () => {
    const status = buildAppSetupStatus({
      env: loadRuntimeEnv({
        DATABASE_URL: "postgres://user:pass@localhost:5432/app",
        AUTH_BASE_URL: "https://app.example.com",
        AUTH_EMAIL_PASSWORD_ENABLED: "false",
        AUTH_EXTERNAL_PROVIDER_ENABLED: "true",
        AUTH_EXTERNAL_PROVIDER_ID: "workspace",
        AUTH_EXTERNAL_DISCOVERY_URL: "https://login.example.com/.well-known/openid-configuration",
        AUTH_EXTERNAL_CLIENT_ID: "client-id",
        AUTH_EXTERNAL_CLIENT_SECRET: "client-secret",
        AUTH_ADMIN_EMAIL_ALLOWLIST: "admin@example.com",
      }),
      settingsRow: emptyRow(),
      adminUserCount: 0,
    });

    expect(status.steps.find((step) => step.id === "auth")?.guardrails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Admin bootstrap",
          state: "ok",
          detail: "External provider admin allowlist or claim mapping can bootstrap admin access.",
        }),
      ]),
    );
  });

  it("accepts external provider admin claim mapping as an auth bootstrap path", () => {
    const status = buildAppSetupStatus({
      env: loadRuntimeEnv({
        DATABASE_URL: "postgres://user:pass@localhost:5432/app",
        AUTH_BASE_URL: "https://app.example.com",
        AUTH_EMAIL_PASSWORD_ENABLED: "false",
        AUTH_EXTERNAL_PROVIDER_ENABLED: "true",
        AUTH_EXTERNAL_PROVIDER_ID: "workspace",
        AUTH_EXTERNAL_DISCOVERY_URL: "https://login.example.com/.well-known/openid-configuration",
        AUTH_EXTERNAL_CLIENT_ID: "client-id",
        AUTH_EXTERNAL_CLIENT_SECRET: "client-secret",
        AUTH_EXTERNAL_ADMIN_CLAIM: "groups",
        AUTH_EXTERNAL_ADMIN_CLAIM_VALUE: "ops",
      }),
      settingsRow: emptyRow(),
      adminUserCount: 0,
    });

    expect(status.steps.find((step) => step.id === "auth")?.guardrails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Admin bootstrap",
          state: "ok",
          detail: "External provider admin allowlist or claim mapping can bootstrap admin access.",
        }),
      ]),
    );
  });

  it("surfaces unsafe live lookup delay ranges as a blocking setting issue", () => {
    const status = buildAppSetupStatus({
      env: loadRuntimeEnv({
        DATABASE_URL: "postgres://user:pass@localhost:5432/app",
        GOOGLE_WORKSPACE_DELEGATED_USER: "operator@example.com",
        GOOGLE_SERVICE_ACCOUNT_KEY_JSON: "/run/secrets/google.json",
        JUNO_LOGIN_EMAIL: "buyer@example.com",
        JUNO_LOGIN_PASSWORD: "secret",
        JUNO_LIVE_DELAY_MIN_MS: "80000",
        JUNO_LIVE_DELAY_MAX_MS: "10000",
      }),
      settingsRow: null,
    });

    const juno = status.steps.find((step) => step.id === "juno");

    expect(status.ready).toBe(false);
    expect(juno).toEqual(
      expect.objectContaining({
        state: "missing",
        missing: ["juno_live_delay_min_ms must be <= juno_live_delay_max_ms"],
        guardrails: expect.arrayContaining([
          expect.objectContaining({ label: "Randomized request pacing", state: "blocked" }),
        ]),
      }),
    );
  });

  it("marks configured polling as blocked when credentials are absent", () => {
    const status = buildAppSetupStatus({
      env: loadRuntimeEnv({
        DATABASE_URL: "postgres://user:pass@localhost:5432/app",
        GOOGLE_WORKSPACE_DELEGATED_USER: "operator@example.com",
        GOOGLE_SERVICE_ACCOUNT_KEY_JSON: "/run/secrets/google.json",
        JUNO_LIVE_POLL_INTERVAL_MS: "3600000",
        JUNO_LIVE_AUTO_ENQUEUE_ON_INTERVAL: "true",
      }),
      settingsRow: null,
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

  it("warns when polling loop is scheduled but automatic enqueue is disabled", () => {
    const status = buildAppSetupStatus({
      env: loadRuntimeEnv({
        DATABASE_URL: "postgres://user:pass@localhost:5432/app",
        GOOGLE_WORKSPACE_DELEGATED_USER: "operator@example.com",
        GOOGLE_SERVICE_ACCOUNT_KEY_JSON: "/run/secrets/google.json",
        JUNO_LOGIN_EMAIL: "buyer@example.com",
        JUNO_LOGIN_PASSWORD: "secret",
        JUNO_LIVE_POLL_INTERVAL_MS: "7200000",
      }),
      settingsRow: null,
    });

    expect(status.steps.find((step) => step.id === "juno")?.guardrails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Scheduled polling",
          state: "warning",
          detail: "Polling loop can stay alive every 2 hours for queued jobs; automatic enqueue is disabled.",
        }),
      ]),
    );
  });

  it("marks a feature missing when required guardrails are blocked even if its own fields are set", () => {
    const status = buildAppSetupStatus({
      env: loadRuntimeEnv({
        JUNO_WHOLESALE_OPS_DATA_MODE: "real_mailbox",
        GOOGLE_WORKSPACE_DELEGATED_USER: "operator@example.com",
        GOOGLE_SERVICE_ACCOUNT_KEY_JSON: "/run/secrets/google.json",
      }),
      settingsRow: null,
    });

    expect(status.ready).toBe(false);
    expect(status.steps.find((step) => step.id === "gmail")).toEqual(
      expect.objectContaining({
        state: "missing",
        missing: [],
        guardrails: [expect.objectContaining({ label: "Cursored Gmail search", state: "blocked" })],
      }),
    );
  });

  it("formats minute-based automatic polling guardrails", () => {
    const status = buildAppSetupStatus({
      env: loadRuntimeEnv({
        DATABASE_URL: "postgres://user:pass@localhost:5432/app",
        GOOGLE_WORKSPACE_DELEGATED_USER: "operator@example.com",
        GOOGLE_SERVICE_ACCOUNT_KEY_JSON: "/run/secrets/google.json",
        JUNO_LOGIN_EMAIL: "buyer@example.com",
        JUNO_LOGIN_PASSWORD: "secret",
        JUNO_LIVE_POLL_INTERVAL_MS: "120000",
        JUNO_LIVE_AUTO_ENQUEUE_ON_INTERVAL: "true",
      }),
      settingsRow: null,
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

  it("formats singular minute automatic polling guardrails", () => {
    const status = buildAppSetupStatus({
      env: loadRuntimeEnv({
        DATABASE_URL: "postgres://user:pass@localhost:5432/app",
        GOOGLE_WORKSPACE_DELEGATED_USER: "operator@example.com",
        GOOGLE_SERVICE_ACCOUNT_KEY_JSON: "/run/secrets/google.json",
        JUNO_LOGIN_EMAIL: "buyer@example.com",
        JUNO_LOGIN_PASSWORD: "secret",
        JUNO_LIVE_POLL_INTERVAL_MS: "60000",
        JUNO_LIVE_AUTO_ENQUEUE_ON_INTERVAL: "true",
      }),
      settingsRow: null,
    });

    expect(status.steps.find((step) => step.id === "juno")?.guardrails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Scheduled polling",
          state: "ok",
          detail: "Automatic lookup is enabled every 1 minute.",
        }),
      ]),
    );
  });

  it("formats plural hour automatic polling guardrails", () => {
    const status = buildAppSetupStatus({
      env: loadRuntimeEnv({
        DATABASE_URL: "postgres://user:pass@localhost:5432/app",
        GOOGLE_WORKSPACE_DELEGATED_USER: "operator@example.com",
        GOOGLE_SERVICE_ACCOUNT_KEY_JSON: "/run/secrets/google.json",
        JUNO_LOGIN_EMAIL: "buyer@example.com",
        JUNO_LOGIN_PASSWORD: "secret",
        JUNO_LIVE_POLL_INTERVAL_MS: "7200000",
        JUNO_LIVE_AUTO_ENQUEUE_ON_INTERVAL: "true",
      }),
      settingsRow: null,
    });

    expect(status.steps.find((step) => step.id === "juno")?.guardrails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Scheduled polling",
          state: "ok",
          detail: "Automatic lookup is enabled every 2 hours.",
        }),
      ]),
    );
  });

  it("formats raw millisecond polling guardrails", () => {
    const status = buildAppSetupStatus({
      env: loadRuntimeEnv({
        DATABASE_URL: "postgres://user:pass@localhost:5432/app",
        GOOGLE_WORKSPACE_DELEGATED_USER: "operator@example.com",
        GOOGLE_SERVICE_ACCOUNT_KEY_JSON: "/run/secrets/google.json",
        JUNO_LOGIN_EMAIL: "buyer@example.com",
        JUNO_LOGIN_PASSWORD: "secret",
        JUNO_LIVE_POLL_INTERVAL_MS: "1500",
        JUNO_LIVE_AUTO_ENQUEUE_ON_INTERVAL: "true",
      }),
      settingsRow: null,
    });

    expect(status.steps.find((step) => step.id === "juno")?.guardrails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Scheduled polling",
          state: "ok",
          detail: "Automatic lookup is enabled every 1500 ms.",
        }),
      ]),
    );
  });

  it("treats blank database strings as unset instead of configured", () => {
    const status = buildAppSetupStatus({
      env: loadRuntimeEnv({
        JUNO_WHOLESALE_OPS_DATA_MODE: "real_mailbox",
      }),
      settingsRow: {
        ...emptyRow(),
        google_workspace_delegated_user: "   ",
      },
    });

    expect(status.steps.find((step) => step.id === "gmail")?.settings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "google_workspace_delegated_user",
          source: "unset",
          state: "missing",
        }),
      ]),
    );
  });

  it("surfaces the migration ledger as the database guardrail", () => {
    const status = buildAppSetupStatus({
      env: loadRuntimeEnv({
        DATABASE_URL: "postgres://user:pass@localhost:5432/app",
        GOOGLE_WORKSPACE_DELEGATED_USER: "operator@example.com",
        GOOGLE_SERVICE_ACCOUNT_KEY_JSON: "/run/secrets/google.json",
        JUNO_LOGIN_EMAIL: "buyer@example.com",
        JUNO_LOGIN_PASSWORD: "secret",
      }),
      settingsRow: emptyRow(),
    });

    expect(status.steps.find((step) => step.id === "database")).toEqual(
      expect.objectContaining({
        state: "complete",
        guardrails: [
          expect.objectContaining({
            label: "Migration ledger",
            state: "ok",
            detail: "Next.js startup applied migrations and the service_setting row is available.",
          }),
        ],
      }),
    );
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
    gmail_ingest_lookback_ms: null,
    google_workspace_delegated_user: null,
    google_service_account_key_json: null,
    google_gmail_scopes: null,
    gmail_ingest_query: null,
    gmail_max_results: null,
    gmail_processed_label: null,
    gmail_storage_dir: null,
    catalog_attachment_pattern: null,
    supplier_code: null,
    auth_secret: null,
    auth_base_url: null,
    auth_trusted_origins: null,
    auth_email_password_enabled: null,
    auth_external_provider_enabled: null,
    auth_external_provider_id: null,
    auth_external_provider_name: null,
    auth_login_logo_url: null,
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
