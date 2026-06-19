import { clampLiveConcurrency } from "./delay";

const DEFAULT_RETRY_DELAY_MS = 300000;
const DEFAULT_BROWSER_PROFILE_DIR = ".data/juno-browser-profile";
const DEFAULT_BROWSER_HEADLESS = true;
const DEFAULT_CONCURRENCY = 1;
const DEFAULT_DELAY_MIN_MS = 30000;
const DEFAULT_DELAY_MAX_MS = 180000;
const DEFAULT_NAV_TIMEOUT_MS = 45000;
const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_AUTO_ENQUEUE_LIMIT = 1000;

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
  auth_secret: string | null;
  auth_base_url: string | null;
  auth_trusted_origins: string | null;
  auth_email_password_login_enabled: boolean;
  auth_login_logo_url: string | null;
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
};

export function resolveJunoLiveSettings(row: JunoLiveServiceSettingsRow | null): JunoLiveSettings {
  const pollIntervalMs = row?.juno_live_poll_interval_ms ?? null;

  return {
    enqueueOnIngest: row?.juno_live_enqueue_on_ingest ?? false,
    loginEmail: row?.juno_login_email ?? undefined,
    loginPassword: row?.juno_login_password ?? undefined,
    browserProfileDir: row?.juno_browser_profile_dir ?? DEFAULT_BROWSER_PROFILE_DIR,
    browserHeadless: row?.juno_browser_headless ?? DEFAULT_BROWSER_HEADLESS,
    concurrency: clampLiveConcurrency(row?.juno_live_concurrency ?? DEFAULT_CONCURRENCY),
    delayMinMs: row?.juno_live_delay_min_ms ?? DEFAULT_DELAY_MIN_MS,
    delayMaxMs: row?.juno_live_delay_max_ms ?? DEFAULT_DELAY_MAX_MS,
    navTimeoutMs: row?.juno_live_nav_timeout_ms ?? DEFAULT_NAV_TIMEOUT_MS,
    maxAttempts: row?.juno_live_max_attempts ?? DEFAULT_MAX_ATTEMPTS,
    pollIntervalMs,
    retryDelayMs: pollIntervalMs ?? DEFAULT_RETRY_DELAY_MS,
    autoEnqueueOnInterval: row?.juno_live_auto_enqueue_on_interval ?? false,
    autoEnqueueLimit: row?.juno_live_auto_enqueue_limit ?? DEFAULT_AUTO_ENQUEUE_LIMIT,
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
