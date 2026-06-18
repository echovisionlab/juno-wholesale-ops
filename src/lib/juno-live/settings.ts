import type { RuntimeEnv } from "@/lib/env";
import { clampLiveConcurrency } from "./delay";

const DEFAULT_RETRY_DELAY_MS = 300000;

export type JunoLiveServiceSettingsRow = {
  data_mode: "demo" | "real_mailbox" | null;
  juno_live_enqueue_on_ingest: boolean | null;
  juno_login_email: string | null;
  juno_login_password: string | null;
  juno_browser_profile_dir: string | null;
  juno_browser_headless: boolean | null;
  juno_live_concurrency: number | null;
  juno_live_delay_min_ms: number | null;
  juno_live_delay_max_ms: number | null;
  juno_live_nav_timeout_ms: number | null;
  juno_live_max_attempts: number | null;
  juno_live_poll_interval_ms: number | null;
  juno_live_auto_enqueue_on_interval: boolean | null;
  juno_live_auto_enqueue_limit: number | null;
  gmail_ingest_lookback_ms: number | null;
  google_workspace_delegated_user: string | null;
  google_service_account_key_json: string | null;
  google_gmail_scopes: string | null;
  gmail_ingest_query: string | null;
  gmail_max_results: number | null;
  gmail_processed_label: string | null;
  gmail_storage_dir: string | null;
  catalog_attachment_pattern: string | null;
  supplier_code: string | null;
  auth_secret: string | null;
  auth_base_url: string | null;
  auth_trusted_origins: string | null;
  auth_email_password_enabled: boolean | null;
  auth_external_provider_enabled: boolean | null;
  auth_external_provider_id: string | null;
  auth_external_provider_name: string | null;
  auth_login_logo_url: string | null;
  auth_external_provider_logo_url: string | null;
  auth_external_provider_button_label: string | null;
  auth_external_discovery_url: string | null;
  auth_external_client_id: string | null;
  auth_external_client_secret: string | null;
  auth_external_provider_scopes: string | null;
  auth_admin_email_allowlist: string | null;
  auth_external_admin_claim: string | null;
  auth_external_admin_claim_value: string | null;
};

export type JunoLiveSettings = {
  enqueueOnIngest: boolean;
  loginEmail: string | undefined;
  loginPassword: string | undefined;
  browserProfileDir: string;
  browserHeadless: boolean;
  concurrency: number;
  delayMinMs: number;
  delayMaxMs: number;
  navTimeoutMs: number;
  maxAttempts: number;
  pollIntervalMs: number | null;
  retryDelayMs: number;
  autoEnqueueOnInterval: boolean;
  autoEnqueueLimit: number;
  gmailIngestLookbackMs: number;
};

export function resolveJunoLiveSettings(
  env: RuntimeEnv,
  row: JunoLiveServiceSettingsRow | null,
): JunoLiveSettings {
  const pollIntervalMs = row?.juno_live_poll_interval_ms ?? env.JUNO_LIVE_POLL_INTERVAL_MS ?? null;

  return {
    enqueueOnIngest: row?.juno_live_enqueue_on_ingest ?? env.JUNO_LIVE_ENQUEUE_ON_INGEST,
    loginEmail: row?.juno_login_email ?? env.JUNO_LOGIN_EMAIL,
    loginPassword: row?.juno_login_password ?? env.JUNO_LOGIN_PASSWORD,
    browserProfileDir: row?.juno_browser_profile_dir ?? env.JUNO_BROWSER_PROFILE_DIR,
    browserHeadless: row?.juno_browser_headless ?? env.JUNO_BROWSER_HEADLESS,
    concurrency: clampLiveConcurrency(row?.juno_live_concurrency ?? env.JUNO_LIVE_CONCURRENCY),
    delayMinMs: row?.juno_live_delay_min_ms ?? env.JUNO_LIVE_DELAY_MIN_MS,
    delayMaxMs: row?.juno_live_delay_max_ms ?? env.JUNO_LIVE_DELAY_MAX_MS,
    navTimeoutMs: row?.juno_live_nav_timeout_ms ?? env.JUNO_LIVE_NAV_TIMEOUT_MS,
    maxAttempts: row?.juno_live_max_attempts ?? env.JUNO_LIVE_MAX_ATTEMPTS,
    pollIntervalMs,
    retryDelayMs: pollIntervalMs ?? DEFAULT_RETRY_DELAY_MS,
    autoEnqueueOnInterval: row?.juno_live_auto_enqueue_on_interval ?? env.JUNO_LIVE_AUTO_ENQUEUE_ON_INTERVAL,
    autoEnqueueLimit: row?.juno_live_auto_enqueue_limit ?? env.JUNO_LIVE_AUTO_ENQUEUE_LIMIT,
    gmailIngestLookbackMs: row?.gmail_ingest_lookback_ms ?? env.GMAIL_INGEST_LOOKBACK_MS,
  };
}

export function shouldContinueAutomaticLookup(
  settings: JunoLiveSettings,
): settings is JunoLiveSettings & { pollIntervalMs: number } {
  return settings.pollIntervalMs !== null;
}

export function shouldAutoEnqueueLiveLookups(
  settings: JunoLiveSettings,
): settings is JunoLiveSettings & { pollIntervalMs: number } {
  return (
    shouldContinueAutomaticLookup(settings) &&
    settings.autoEnqueueOnInterval &&
    Boolean(settings.loginEmail) &&
    Boolean(settings.loginPassword)
  );
}
