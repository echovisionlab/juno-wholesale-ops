import { describe, expect, it } from "vitest";
import { loadRuntimeEnv } from "@/lib/env";
import type { JunoLiveServiceSettingsRow } from "@/lib/juno-live/settings";
import { buildAppSetupStatus } from "./status";

describe("buildAppSetupStatus", () => {
  it("marks a fresh install as missing only required runtime settings", () => {
    expect(
      buildAppSetupStatus({
        env: loadRuntimeEnv({}),
        settingsRow: null,
      }),
    ).toEqual({
      ready: false,
      steps: [
        expect.objectContaining({ id: "database", state: "missing", missing: ["DATABASE_URL"] }),
        expect.objectContaining({
          id: "gmail",
          state: "missing",
          missing: ["google_workspace_delegated_user", "google_service_account_key_json"],
        }),
        expect.objectContaining({
          id: "juno",
          state: "missing",
          missing: ["juno_login_email", "juno_login_password"],
        }),
        expect.objectContaining({ id: "auth", state: "disabled", missing: [] }),
      ],
    });
  });

  it("marks setup complete when values come from env and database settings", () => {
    const status = buildAppSetupStatus({
      env: loadRuntimeEnv({
        DATABASE_URL: "postgres://user:pass@localhost:5432/app",
        AUTH_ENABLED: "true",
        AUTH_SECRET: "a".repeat(32),
        AUTH_BASE_URL: "https://app.example.com",
        GOOGLE_WORKSPACE_DELEGATED_USER: "operator@example.com",
        GOOGLE_SERVICE_ACCOUNT_KEY_JSON: "/run/secrets/google.json",
      }),
      settingsRow: {
        ...emptyRow(),
        juno_login_email: "buyer@example.com",
        juno_login_password: "secret",
      },
    });

    expect(status.ready).toBe(true);
    expect(status.steps.map((step) => step.state)).toEqual(["complete", "complete", "complete", "complete"]);
  });

  it("reports enabled auth as missing when provider settings are absent", () => {
    const status = buildAppSetupStatus({
      env: loadRuntimeEnv({
        DATABASE_URL: "postgres://user:pass@localhost:5432/app",
        AUTH_ENABLED: "true",
        GOOGLE_WORKSPACE_DELEGATED_USER: "operator@example.com",
        GOOGLE_SERVICE_ACCOUNT_KEY_JSON: "/run/secrets/google.json",
        JUNO_LOGIN_EMAIL: "buyer@example.com",
        JUNO_LOGIN_PASSWORD: "secret",
      }),
      settingsRow: null,
    });

    expect(status.ready).toBe(false);
    expect(status.steps.at(-1)).toEqual(
      expect.objectContaining({
        id: "auth",
        state: "missing",
        missing: ["AUTH_SECRET", "auth_base_url"],
      }),
    );
  });
});

function emptyRow(): JunoLiveServiceSettingsRow {
  return {
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
