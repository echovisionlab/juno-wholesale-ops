import type { RuntimeEnv } from "@/lib/env";
import { getMissingAppAuthSettings, resolveAppAuthSettings } from "@/lib/auth/settings";
import {
  getMissingGmailIngestSettings,
  resolveGmailIngestSettings,
} from "@/lib/ingest/settings";
import {
  resolveJunoLiveSettings,
  shouldAutoEnqueueLiveLookups,
  shouldContinueAutomaticLookup,
  type JunoLiveServiceSettingsRow,
} from "@/lib/juno-live/settings";

export type SetupStepState = "complete" | "missing" | "disabled" | "warning";

export type SetupSettingSource = "database" | "runtime" | "unset";

export type SetupSettingState = "configured" | "missing" | "disabled";

export type SetupSetting = {
  key: string;
  label: string;
  source: SetupSettingSource;
  state: SetupSettingState;
  value: string;
  secret?: boolean;
};

export type SetupGuardrailState = "ok" | "warning" | "blocked";

export type SetupGuardrail = {
  label: string;
  state: SetupGuardrailState;
  detail: string;
};

export type SetupStep = {
  id: "database" | "gmail" | "juno" | "auth";
  label: string;
  state: SetupStepState;
  detail: string;
  action: string | null;
  missing: string[];
  settings: SetupSetting[];
  guardrails: SetupGuardrail[];
};

export type AppSetupStatus = {
  ready: boolean;
  steps: SetupStep[];
};

export function buildAppSetupStatus(options: {
  env: RuntimeEnv;
  settingsRow: JunoLiveServiceSettingsRow | null;
}): AppSetupStatus {
  const databaseMissing = options.env.DATABASE_URL ? [] : ["DATABASE_URL"];
  const gmailSettings = resolveGmailIngestSettings(options.env, options.settingsRow);
  const gmailMissing = getMissingGmailIngestSettings(gmailSettings);
  const liveSettings = resolveJunoLiveSettings(options.env, options.settingsRow);
  const junoMissing = [
    liveSettings.loginEmail ? null : "juno_login_email",
    liveSettings.loginPassword ? null : "juno_login_password",
    liveSettings.delayMinMs <= liveSettings.delayMaxMs
      ? null
      : "juno_live_delay_min_ms must be <= juno_live_delay_max_ms",
  ].filter((value): value is string => Boolean(value));
  const authSettings = resolveAppAuthSettings(options.env, options.settingsRow);
  const authMissing = getMissingAppAuthSettings(authSettings);
  const pollingGuardrail = scheduledPollingGuardrail(liveSettings);

  const steps: SetupStep[] = [
    setupStep({
      id: "database",
      label: "Database",
      missing: databaseMissing,
      detail: "required for persistence and worker state",
      action: databaseMissing.length > 0 ? "Set DATABASE_URL before enabling ingestion or live lookup." : null,
      settings: [
        runtimeSetting({
          key: "DATABASE_URL",
          label: "Postgres connection",
          value: options.env.DATABASE_URL,
          required: true,
          secret: true,
        }),
      ],
      guardrails: [
        options.env.DATABASE_URL
          ? {
              label: "Migration ledger",
              state: options.settingsRow ? "ok" : "warning",
              detail: options.settingsRow
                ? "Next.js startup applied migrations and the service_setting row is available."
                : "Startup migrations run automatically, but the singleton service_setting row is not available yet.",
            }
          : {
              label: "Persistent state",
              state: "blocked",
              detail: "No database connection is configured.",
            },
      ],
    }),
    setupStep({
      id: "gmail",
      label: "Gmail ingest",
      missing: gmailMissing,
      detail: "required for catalog email ingestion",
      action: gmailMissing.length > 0 ? "Configure the delegated mailbox, service account key, query, storage, and supplier defaults." : null,
      settings: [
        rowBackedSetting({
          key: "google_workspace_delegated_user",
          label: "Delegated mailbox",
          rowValue: options.settingsRow?.google_workspace_delegated_user,
          runtimeValue: options.env.GOOGLE_WORKSPACE_DELEGATED_USER,
          required: true,
        }),
        rowBackedSetting({
          key: "google_service_account_key_json",
          label: "Service account key",
          rowValue: options.settingsRow?.google_service_account_key_json,
          runtimeValue: options.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON,
          required: true,
          secret: true,
        }),
        rowBackedSetting({
          key: "gmail_ingest_query",
          label: "Search query",
          rowValue: options.settingsRow?.gmail_ingest_query,
          runtimeValue: options.env.GMAIL_INGEST_QUERY,
          required: true,
        }),
        rowBackedSetting({
          key: "catalog_attachment_pattern",
          label: "Attachment pattern",
          rowValue: options.settingsRow?.catalog_attachment_pattern,
          runtimeValue: options.env.CATALOG_ATTACHMENT_PATTERN,
          required: true,
        }),
        rowBackedSetting({
          key: "gmail_storage_dir",
          label: "Attachment storage",
          rowValue: options.settingsRow?.gmail_storage_dir,
          runtimeValue: options.env.GMAIL_STORAGE_DIR,
          required: true,
        }),
        rowBackedSetting({
          key: "supplier_code",
          label: "Supplier code",
          rowValue: options.settingsRow?.supplier_code,
          runtimeValue: options.env.SUPPLIER_CODE,
          required: true,
        }),
        rowBackedSetting({
          key: "google_gmail_scopes",
          label: "Gmail scopes",
          rowValue: options.settingsRow?.google_gmail_scopes,
          runtimeValue: options.env.GOOGLE_GMAIL_SCOPES,
        }),
        rowBackedSetting({
          key: "gmail_max_results",
          label: "Max messages per run",
          rowValue: options.settingsRow?.gmail_max_results,
          runtimeValue: options.env.GMAIL_MAX_RESULTS,
        }),
      ],
      guardrails: [
        {
          label: "Cursored Gmail search",
          state: options.env.DATABASE_URL ? "ok" : "blocked",
          detail: options.env.DATABASE_URL
            ? "Ingest can use stored cursor state and content hashes to avoid duplicate sheets."
            : "Database state is required before ingest can dedupe safely.",
        },
      ],
    }),
    setupStep({
      id: "juno",
      label: "Live stock lookup",
      missing: junoMissing,
      detail: "required for browser-based stock checks",
      action: junoMissing.length > 0 ? "Configure credentials and keep delay bounds sane before starting the worker." : null,
      settings: [
        rowBackedSetting({
          key: "juno_login_email",
          label: "Login email",
          rowValue: options.settingsRow?.juno_login_email,
          runtimeValue: options.env.JUNO_LOGIN_EMAIL,
          required: true,
        }),
        rowBackedSetting({
          key: "juno_login_password",
          label: "Login password",
          rowValue: options.settingsRow?.juno_login_password,
          runtimeValue: options.env.JUNO_LOGIN_PASSWORD,
          required: true,
          secret: true,
        }),
        rowBackedSetting({
          key: "juno_live_poll_interval_ms",
          label: "Automatic lookup interval",
          rowValue: options.settingsRow?.juno_live_poll_interval_ms,
          runtimeValue: options.env.JUNO_LIVE_POLL_INTERVAL_MS,
          emptyValue: "manual only",
        }),
        rowBackedSetting({
          key: "juno_live_delay_min_ms",
          label: "Minimum page delay",
          rowValue: options.settingsRow?.juno_live_delay_min_ms,
          runtimeValue: options.env.JUNO_LIVE_DELAY_MIN_MS,
        }),
        rowBackedSetting({
          key: "juno_live_delay_max_ms",
          label: "Maximum page delay",
          rowValue: options.settingsRow?.juno_live_delay_max_ms,
          runtimeValue: options.env.JUNO_LIVE_DELAY_MAX_MS,
        }),
        rowBackedSetting({
          key: "juno_live_concurrency",
          label: "Parallel pages",
          rowValue: options.settingsRow?.juno_live_concurrency,
          runtimeValue: liveSettings.concurrency,
        }),
      ],
      guardrails: [
        {
          label: "Read-only browser lookup",
          state: liveSettings.loginEmail && liveSettings.loginPassword ? "ok" : "blocked",
          detail: liveSettings.loginEmail && liveSettings.loginPassword
            ? "Worker can reuse a persistent browser session and avoid cart or wishlist actions."
            : "Credentials are required before lookup jobs can run.",
        },
        {
          label: "Randomized request pacing",
          state: liveSettings.delayMinMs <= liveSettings.delayMaxMs ? "ok" : "blocked",
          detail: liveSettings.delayMinMs <= liveSettings.delayMaxMs
            ? `${liveSettings.delayMinMs}-${liveSettings.delayMaxMs} ms delay window is valid.`
            : "Minimum delay is greater than maximum delay.",
        },
        {
          label: "Scheduled polling",
          state: pollingGuardrail.state,
          detail: pollingGuardrail.detail,
        },
      ],
    }),
    authSettings.enabled
      ? setupStep({
          id: "auth",
          label: "Admin auth",
          missing: authMissing,
          detail: "Better Auth admin gate",
          action: authMissing.length > 0 ? "Set the auth secret, base URL, and at least one sign-in method." : null,
          settings: [
            rowBackedSetting({
              key: "auth_enabled",
              label: "Admin gate",
              rowValue: options.settingsRow?.auth_enabled,
              runtimeValue: options.env.AUTH_ENABLED,
            }),
            runtimeSetting({
              key: "AUTH_SECRET",
              label: "Auth secret",
              value: options.env.AUTH_SECRET,
              required: true,
              secret: true,
            }),
            rowBackedSetting({
              key: "auth_base_url",
              label: "Public base URL",
              rowValue: options.settingsRow?.auth_base_url,
              runtimeValue: options.env.AUTH_BASE_URL,
              required: true,
            }),
            rowBackedSetting({
              key: "auth_email_password_enabled",
              label: "Email/password login",
              rowValue: options.settingsRow?.auth_email_password_enabled,
              runtimeValue: options.env.AUTH_EMAIL_PASSWORD_ENABLED,
            }),
            rowBackedSetting({
              key: "auth_external_provider_enabled",
              label: "External provider",
              rowValue: options.settingsRow?.auth_external_provider_enabled,
              runtimeValue: options.env.AUTH_EXTERNAL_PROVIDER_ENABLED,
            }),
            rowBackedSetting({
              key: "auth_external_provider_id",
              label: "External provider id",
              rowValue: options.settingsRow?.auth_external_provider_id,
              runtimeValue: options.env.AUTH_EXTERNAL_PROVIDER_ID,
              required: authSettings.externalProviderEnabled,
            }),
            rowBackedSetting({
              key: "auth_external_client_secret",
              label: "External client secret",
              rowValue: options.settingsRow?.auth_external_client_secret,
              runtimeValue: options.env.AUTH_EXTERNAL_CLIENT_SECRET,
              required: authSettings.externalProviderEnabled,
              secret: true,
            }),
          ],
          guardrails: [
            {
              label: "Sign-in method",
              state: authSettings.emailPasswordEnabled || authSettings.externalProviderEnabled ? "ok" : "blocked",
              detail: authSettings.emailPasswordEnabled || authSettings.externalProviderEnabled
                ? "At least one sign-in path is enabled."
                : "Auth is enabled, but every sign-in method is disabled.",
            },
            {
              label: "Initial admin seed",
              state: authSettings.initialAdmin ? "ok" : "warning",
              detail: authSettings.initialAdmin
                ? "An initial admin can be inserted idempotently during migration."
                : "No initial admin env is configured; use an external provider or create an admin separately.",
            },
          ],
        })
      : {
          id: "auth",
          label: "Admin auth",
          state: "disabled",
          detail: "Better Auth admin gate is disabled",
          action: "Enable AUTH_ENABLED or auth_enabled when this service is exposed beyond trusted local access.",
          missing: [],
          settings: [
            rowBackedSetting({
              key: "auth_enabled",
              label: "Admin gate",
              rowValue: options.settingsRow?.auth_enabled,
              runtimeValue: options.env.AUTH_ENABLED,
              emptyValue: "disabled",
            }),
          ],
          guardrails: [
            {
              label: "Protected access",
              state: "warning",
              detail: "Requests are not gated by Better Auth while this setting is disabled.",
            },
          ],
        },
  ];

  return {
    ready: steps.every((step) => step.state !== "missing"),
    steps,
  };
}

function setupStep(options: Omit<SetupStep, "state">): SetupStep {
  return {
    ...options,
    state: options.missing.length > 0 ? "missing" : guardrailStepState(options.guardrails),
  };
}

function guardrailStepState(guardrails: SetupGuardrail[]): SetupStepState {
  if (guardrails.some((guardrail) => guardrail.state === "blocked")) {
    return "missing";
  }
  return guardrails.some((guardrail) => guardrail.state === "warning") ? "warning" : "complete";
}

function scheduledPollingGuardrail(
  liveSettings: ReturnType<typeof resolveJunoLiveSettings>,
): Pick<SetupGuardrail, "state" | "detail"> {
  if (!shouldContinueAutomaticLookup(liveSettings)) {
    return {
      state: "warning",
      detail: "No polling interval is set; lookups stay manual.",
    };
  }

  if (!liveSettings.autoEnqueueOnInterval) {
    return {
      state: "warning",
      detail: `Polling loop can stay alive every ${formatDuration(
        liveSettings.pollIntervalMs,
      )} for queued jobs; automatic enqueue is disabled.`,
    };
  }

  if (!shouldAutoEnqueueLiveLookups(liveSettings)) {
    return {
      state: "blocked",
      detail: "Automatic enqueue is enabled, but credentials are missing.",
    };
  }

  return {
    state: "ok",
    detail: `Automatic lookup is enabled every ${formatDuration(liveSettings.pollIntervalMs)}.`,
  };
}

function rowBackedSetting(options: {
  key: string;
  label: string;
  rowValue: string | number | boolean | null | undefined;
  runtimeValue: string | number | boolean | null | undefined;
  required?: boolean;
  secret?: boolean;
  emptyValue?: string;
}): SetupSetting {
  const rowConfigured = hasSettingValue(options.rowValue);
  const runtimeConfigured = hasSettingValue(options.runtimeValue);
  const source: SetupSettingSource = rowConfigured ? "database" : runtimeConfigured ? "runtime" : "unset";
  const value = rowConfigured ? options.rowValue : runtimeConfigured ? options.runtimeValue : undefined;

  return buildSetting({
    key: options.key,
    label: options.label,
    source,
    value,
    required: options.required ?? false,
    secret: options.secret ?? false,
    emptyValue: options.emptyValue,
  });
}

function runtimeSetting(options: {
  key: string;
  label: string;
  value: string | number | boolean | null | undefined;
  required: boolean;
  secret: boolean;
}): SetupSetting {
  return buildSetting({
    key: options.key,
    label: options.label,
    source: hasSettingValue(options.value) ? "runtime" : "unset",
    value: options.value,
    required: options.required,
    secret: options.secret,
  });
}

function buildSetting(options: {
  key: string;
  label: string;
  source: SetupSettingSource;
  value: string | number | boolean | null | undefined;
  required: boolean;
  secret: boolean;
  emptyValue?: string;
}): SetupSetting {
  const configured = hasSettingValue(options.value);
  return {
    key: options.key,
    label: options.label,
    source: options.source,
    state: configured ? "configured" : options.required ? "missing" : "disabled",
    value: configured ? displaySettingValue(options.value, options.secret) : options.emptyValue ?? "not set",
    secret: options.secret || undefined,
  };
}

function hasSettingValue(value: string | number | boolean | null | undefined): boolean {
  return typeof value === "string" ? value.trim().length > 0 : value !== null && value !== undefined;
}

function displaySettingValue(value: string | number | boolean | null | undefined, secret: boolean): string {
  if (secret) {
    return "configured";
  }
  if (typeof value === "boolean") {
    return value ? "enabled" : "disabled";
  }
  return String(value);
}

function formatDuration(ms: number): string {
  if (ms % 3600000 === 0) {
    const hours = ms / 3600000;
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  if (ms % 60000 === 0) {
    const minutes = ms / 60000;
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  return `${ms} ms`;
}
