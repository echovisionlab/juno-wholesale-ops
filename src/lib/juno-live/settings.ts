import type { RuntimeEnv } from "@/lib/env";
import { clampLiveConcurrency } from "./delay";

const DEFAULT_RETRY_DELAY_MS = 300000;

export type JunoLiveServiceSettingsRow = {
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
