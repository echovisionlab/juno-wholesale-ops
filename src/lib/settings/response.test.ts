import { describe, expect, it } from "vitest";
import { loadRuntimeEnv } from "@/lib/env";
import { serviceSettingColumns, settingDefinitions, type ServiceSettingsRow } from "./descriptors";
import { buildSettingsResponse } from "./response";
import { validateSettingsPatch } from "./validation";

describe("settings response and validation", () => {
  it("resolves database overrides, runtime fallback, defaults, unset values, and masked secrets", () => {
    const env = loadRuntimeEnv({
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
        google_service_account_key_json: "raw-service-account-json",
      },
      nodeEnv: "development",
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
    expect(descriptor(response, "google_service_account_key_json")).toMatchObject({
      source: "database",
      displayValue: "Database override configured",
      value: null,
      secret: true,
    });
    expect(descriptor(response, "google_gmail_scopes")).toMatchObject({
      source: "default",
      displayValue: "https://www.googleapis.com/auth/gmail.readonly",
    });
    expect(descriptor(response, "juno_login_email")).toMatchObject({
      source: "unset",
      state: "missing",
    });
    expect(JSON.stringify(response)).not.toContain("raw-service-account-json");
    expect(JSON.stringify(response)).not.toContain("runtime-password");
    expect(response.nextActions.map((action) => action.id)).toContain("open-settings-center");
  });

  it("validates patch semantics and unsafe settings", () => {
    const env = loadRuntimeEnv({
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
        input: {
          auth: { auth_enabled: false },
          gmail: { google_gmail_scopes: "https://www.googleapis.com/auth/gmail.modify" },
          juno: { juno_live_concurrency: 11, juno_live_poll_interval_ms: 0 },
        },
        currentRow: emptySettingsRow(),
        env,
        rawEnv: {},
        nodeEnv: "production",
      }),
    ).toMatchObject({
      ok: false,
      warnings: expect.arrayContaining([
        expect.objectContaining({ id: "gmail_modify_scope", severity: "warning" }),
        expect.objectContaining({ id: "production_auth_disabled", severity: "critical" }),
      ]),
      issues: expect.arrayContaining([
        "juno_live_concurrency must be between 1 and 10",
        "juno_live_poll_interval_ms must be null or a positive integer",
      ]),
    });
  });

  it("covers every editable service_setting column with a descriptor", () => {
    const described = new Set(settingDefinitions.map((definition) => definition.rowColumn).filter(Boolean));
    expect(described).toEqual(new Set(serviceSettingColumns));
  });
});

function descriptor(response: ReturnType<typeof buildSettingsResponse>, key: string) {
  const setting = response.groups.find((group) => group.id === "advanced")?.settings.find((entry) => entry.key === key);
  if (!setting) {
    throw new Error(`Missing descriptor ${key}`);
  }
  return setting;
}

function emptySettingsRow(): ServiceSettingsRow {
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
    updated_at: null,
  };
}
