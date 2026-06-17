import { describe, expect, it } from "vitest";
import { loadRuntimeEnv } from "@/lib/env";
import {
  resolveJunoLiveSettings,
  shouldAutoEnqueueLiveLookups,
  shouldContinueAutomaticLookup,
  type JunoLiveServiceSettingsRow,
} from "./settings";

const requiredEnv = {
  GOOGLE_WORKSPACE_DELEGATED_USER: "operator@example.com",
  GOOGLE_SERVICE_ACCOUNT_KEY_JSON: "/tmp/key.json",
};

describe("resolveJunoLiveSettings", () => {
  it("uses env values when the service settings row is empty", () => {
    const env = loadRuntimeEnv({
      ...requiredEnv,
      JUNO_LOGIN_EMAIL: "catalog@example.com",
      JUNO_LOGIN_PASSWORD: "secret",
      JUNO_LIVE_ENQUEUE_ON_INGEST: "true",
      JUNO_LIVE_POLL_INTERVAL_MS: "300000",
    });

    const settings = resolveJunoLiveSettings(env, emptyRow());

    expect(settings).toMatchObject({
      enqueueOnIngest: true,
      loginEmail: "catalog@example.com",
      loginPassword: "secret",
      browserProfileDir: ".data/juno-browser-profile",
      browserHeadless: true,
      concurrency: 6,
      delayMinMs: 15000,
      delayMaxMs: 75000,
      navTimeoutMs: 45000,
      maxAttempts: 2,
      pollIntervalMs: 300000,
      retryDelayMs: 300000,
      autoEnqueueOnInterval: true,
      autoEnqueueLimit: 1000,
      gmailIngestLookbackMs: 604800000,
    });
    expect(shouldContinueAutomaticLookup(settings)).toBe(true);
    expect(shouldAutoEnqueueLiveLookups(settings)).toBe(true);
  });

  it("lets database settings override env values", () => {
    const env = loadRuntimeEnv({
      ...requiredEnv,
      JUNO_LOGIN_EMAIL: "env@example.com",
      JUNO_LOGIN_PASSWORD: "env-secret",
      JUNO_LIVE_CONCURRENCY: "3",
      JUNO_LIVE_POLL_INTERVAL_MS: "300000",
      JUNO_LIVE_AUTO_ENQUEUE_ON_INTERVAL: "true",
      JUNO_LIVE_AUTO_ENQUEUE_LIMIT: "1000",
      GMAIL_INGEST_LOOKBACK_MS: "604800000",
    });

    const settings = resolveJunoLiveSettings(env, {
      ...emptyRow(),
      juno_live_enqueue_on_ingest: true,
      juno_login_email: "db@example.com",
      juno_login_password: "db-secret",
      juno_browser_profile_dir: "/profile",
      juno_browser_headless: false,
      juno_live_concurrency: 12,
      juno_live_delay_min_ms: 1000,
      juno_live_delay_max_ms: 2000,
      juno_live_nav_timeout_ms: 3000,
      juno_live_max_attempts: 4,
      juno_live_poll_interval_ms: 600000,
      juno_live_auto_enqueue_on_interval: false,
      juno_live_auto_enqueue_limit: 25,
      gmail_ingest_lookback_ms: 86400000,
    });

    expect(settings).toMatchObject({
      enqueueOnIngest: true,
      loginEmail: "db@example.com",
      loginPassword: "db-secret",
      browserProfileDir: "/profile",
      browserHeadless: false,
      concurrency: 10,
      delayMinMs: 1000,
      delayMaxMs: 2000,
      navTimeoutMs: 3000,
      maxAttempts: 4,
      pollIntervalMs: 600000,
      retryDelayMs: 600000,
      autoEnqueueOnInterval: false,
      autoEnqueueLimit: 25,
      gmailIngestLookbackMs: 86400000,
    });
    expect(shouldAutoEnqueueLiveLookups(settings)).toBe(false);
  });

  it("disables automatic polling when both database and env omit the interval", () => {
    const env = loadRuntimeEnv(requiredEnv);
    const settings = resolveJunoLiveSettings(env, null);

    expect(settings.pollIntervalMs).toBeNull();
    expect(settings.retryDelayMs).toBe(300000);
    expect(shouldContinueAutomaticLookup(settings)).toBe(false);
    expect(shouldAutoEnqueueLiveLookups(settings)).toBe(false);
  });

  it("requires credentials for automatic interval enqueue", () => {
    const env = loadRuntimeEnv({
      ...requiredEnv,
      JUNO_LIVE_POLL_INTERVAL_MS: "300000",
    });
    const settings = resolveJunoLiveSettings(env, null);

    expect(shouldContinueAutomaticLookup(settings)).toBe(true);
    expect(shouldAutoEnqueueLiveLookups(settings)).toBe(false);
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
