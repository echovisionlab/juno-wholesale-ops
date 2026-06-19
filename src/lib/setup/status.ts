import type { RuntimeEnv } from "@/lib/env";
import { getMissingAppAuthSettings, resolveAppAuthSettings } from "@/lib/auth/settings";
import type { SsoProviderRecord } from "@/lib/auth/sso-provider-repository";
import type { PublicMailboxSource } from "@/lib/ingest/mail-source";
import {
  resolveJunoLiveSettings,
  shouldAutoEnqueueLiveLookups,
  shouldContinueAutomaticLookup,
  type JunoLiveServiceSettingsRow,
} from "@/lib/juno-live/settings";

export type SetupStepState = "complete" | "missing" | "disabled" | "warning";

export type SetupSettingSource = "database" | "default" | "runtime" | "unset";

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
  id: "database" | "mail" | "juno" | "auth";
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
  adminUserCount?: number | null;
  mailSources?: PublicMailboxSource[];
  ssoProviders?: SsoProviderRecord[];
}): AppSetupStatus {
  const mailSources = options.mailSources ?? [];
  const runnableMailSources = mailSources.filter(isRunnableMailSource);
  const mailMissing = runnableMailSources.length === 0 ? ["mail_source"] : [];
  const liveSettings = resolveJunoLiveSettings(options.settingsRow);
  const junoLookupEnabled = isJunoLookupEnabled(options.settingsRow);
  const junoMissing = [
    junoLookupEnabled && !liveSettings.loginEmail ? "juno_login_email" : null,
    junoLookupEnabled && !liveSettings.loginPassword ? "juno_login_password" : null,
    liveSettings.delayMinMs <= liveSettings.delayMaxMs
      ? null
      : "juno_live_delay_min_ms must be <= juno_live_delay_max_ms",
  ].filter((value): value is string => Boolean(value));
  const authSettings = resolveAppAuthSettings(options.env, options.settingsRow, {
    ssoProviders: options.ssoProviders ?? [],
  });
  const authMissing = getMissingAppAuthSettings(authSettings);
  const pollingGuardrail = scheduledPollingGuardrail(liveSettings);

  const steps: SetupStep[] = [
    setupStep({
      id: "database",
      label: "Database",
      missing: [],
      detail: "required for persistence and worker state",
      action: null,
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
        {
          label: "Migration ledger",
          state: options.settingsRow ? "ok" : "warning",
          detail: options.settingsRow
            ? "Next.js startup applied migrations and saved settings are available."
            : "Startup migrations run automatically, but saved settings are not available yet.",
        },
      ],
    }),
    setupStep({
      id: "mail",
      label: "Mail sources",
      missing: mailMissing,
      detail: "required for catalog email ingestion",
      action: mailMissing.length > 0 ? "Create an active mail source with a read-only adapter and verified credential." : null,
      settings: [
        staticSetting({
          key: "active_mail_sources",
          label: "Active sources",
          value: String(mailSources.filter((source) => source.isActive).length),
          required: true,
        }),
        staticSetting({
          key: "runnable_gmail_sources",
          label: "Runnable mail sources",
          value: String(runnableMailSources.length),
          required: true,
        }),
        staticSetting({
          key: "credential_state",
          label: "Credential state",
          value: runnableMailSources.length > 0 ? "configured" : "not configured",
          required: true,
          secret: true,
        }),
      ],
      guardrails: [
        {
          label: "Cursored mail search",
          state: "ok",
          detail: "Ingest uses mailbox source cursor state and content hashes to avoid duplicate sheets.",
        },
      ],
    }),
    setupStep({
      id: "juno",
      label: "Live stock lookup",
      missing: junoMissing,
      detail: junoLookupEnabled ? "enabled read-only browser-based stock checks" : "optional read-only browser lookup",
      action: junoMissing.length > 0 ? "Configure credentials and keep delay bounds sane before starting the worker." : null,
      settings: [
        rowBackedSetting({
          key: "juno_login_email",
          label: "Login email",
          rowValue: options.settingsRow?.juno_login_email,
          required: junoLookupEnabled,
        }),
        rowBackedSetting({
          key: "juno_login_password",
          label: "Login password",
          rowValue: options.settingsRow?.juno_login_password,
          required: junoLookupEnabled,
          secret: true,
        }),
        rowBackedSetting({
          key: "juno_live_poll_interval_ms",
          label: "Automatic lookup interval",
          rowValue: options.settingsRow?.juno_live_poll_interval_ms,
          emptyValue: "manual only",
        }),
        rowBackedSetting({
          key: "juno_live_delay_min_ms",
          label: "Minimum page delay",
          rowValue: options.settingsRow?.juno_live_delay_min_ms,
          defaultValue: liveSettings.delayMinMs,
        }),
        rowBackedSetting({
          key: "juno_live_delay_max_ms",
          label: "Maximum page delay",
          rowValue: options.settingsRow?.juno_live_delay_max_ms,
          defaultValue: liveSettings.delayMaxMs,
        }),
        rowBackedSetting({
          key: "juno_live_concurrency",
          label: "Parallel pages",
          rowValue: options.settingsRow?.juno_live_concurrency,
          defaultValue: liveSettings.concurrency,
        }),
      ],
      guardrails: [
        {
          label: "Read-only browser lookup",
          state: !junoLookupEnabled ? "warning" : liveSettings.loginEmail && liveSettings.loginPassword ? "ok" : "blocked",
          detail: !junoLookupEnabled
            ? "Live lookup is disabled; missing credentials do not block app setup."
            : liveSettings.loginEmail && liveSettings.loginPassword
              ? "Worker can reuse a persistent browser session and only open read-only product pages."
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
    setupStep({
      id: "auth",
      label: "Admin auth",
      missing: authMissing,
      detail: "Better Auth admin gate is always enabled",
      action: authMissing.length > 0 ? "Set the Site address." : null,
      settings: [
        rowBackedSetting({
          key: "auth_base_url",
          label: "Site address",
          rowValue: options.settingsRow?.auth_base_url,
          required: true,
        }),
        rowBackedSetting({
          key: "auth_email_password_login_enabled",
          label: "Email/password login",
          rowValue: options.settingsRow?.auth_email_password_login_enabled,
          defaultValue: true,
        }),
      ],
      guardrails: [
        {
          label: "Admin bootstrap",
          state: adminBootstrapGuardrailState({
            adminUserCount: options.adminUserCount ?? null,
            hasInitialAdmin: Boolean(authSettings.initialAdmin),
            hasExternalAdminMapping: authSettings.externalProviders.some((provider) => provider.adminRules.length > 0),
          }),
          detail: adminBootstrapGuardrailDetail({
            adminUserCount: options.adminUserCount ?? null,
            hasInitialAdmin: Boolean(authSettings.initialAdmin),
            hasExternalAdminMapping: authSettings.externalProviders.some((provider) => provider.adminRules.length > 0),
          }),
        },
      ],
    }),
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

function isJunoLookupEnabled(row: JunoLiveServiceSettingsRow | null): boolean {
  const enqueueOnIngest = row?.juno_live_enqueue_on_ingest ?? false;
  const autoEnqueueOnInterval = row?.juno_live_auto_enqueue_on_interval ?? false;
  const pollInterval = row?.juno_live_poll_interval_ms ?? null;
  return Boolean(enqueueOnIngest || autoEnqueueOnInterval || pollInterval);
}

function adminBootstrapGuardrailState(options: {
  adminUserCount: number | null;
  hasInitialAdmin: boolean;
  hasExternalAdminMapping: boolean;
}): SetupGuardrailState {
  if ((options.adminUserCount ?? 0) > 0 || options.hasInitialAdmin || options.hasExternalAdminMapping) {
    return "ok";
  }
  return options.adminUserCount === null ? "warning" : "blocked";
}

function adminBootstrapGuardrailDetail(options: {
  adminUserCount: number | null;
  hasInitialAdmin: boolean;
  hasExternalAdminMapping: boolean;
}): string {
  if ((options.adminUserCount ?? 0) > 0) {
    return "At least one admin user exists.";
  }
  if (options.hasInitialAdmin) {
    return "Initial admin env can bootstrap admin access.";
  }
  if (options.hasExternalAdminMapping) {
    return "External provider admin allowlist or claim mapping can bootstrap admin access.";
  }
  if (options.adminUserCount === null) {
    return "Admin user count is unavailable; configure initial admin env or external provider admin mapping before production exposure.";
  }
  return "Auth bootstrap blocked. No admin access path configured.";
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
  defaultValue?: string | number | boolean | null | undefined;
  required?: boolean;
  secret?: boolean;
  emptyValue?: string;
}): SetupSetting {
  const rowConfigured = hasSettingValue(options.rowValue);
  const defaultConfigured = hasSettingValue(options.defaultValue);
  const source: SetupSettingSource = rowConfigured ? "database" : defaultConfigured ? "default" : "unset";
  const value = rowConfigured ? options.rowValue : defaultConfigured ? options.defaultValue : undefined;

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
    source: "runtime",
    value: options.value,
    required: options.required,
    secret: options.secret,
  });
}

function staticSetting(options: {
  key: string;
  label: string;
  value: string;
  required: boolean;
  secret?: boolean;
}): SetupSetting {
  return buildSetting({
    key: options.key,
    label: options.label,
    source: "database",
    value: options.value,
    required: options.required,
    secret: options.secret ?? false,
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

function isRunnableMailSource(source: PublicMailboxSource): boolean {
  return (
    source.isActive &&
    source.provider === "gmail" &&
    source.authType === "google_workspace_delegation" &&
    source.credentialType === "google_service_account_json" &&
    source.credentialConfigured
  );
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
