import type { RuntimeEnv } from "@/lib/env";
import {
  isAdminAuthProviderConfigured,
  type AdminAuthConfig,
} from "@/lib/auth/admin-auth";
import {
  getMissingGmailIngestSettings,
  resolveGmailIngestSettings,
} from "@/lib/ingest/settings";
import { resolveJunoLiveSettings, type JunoLiveServiceSettingsRow } from "@/lib/juno-live/settings";

export type SetupStepState = "complete" | "missing" | "disabled";

export type SetupStep = {
  id: "database" | "gmail" | "juno" | "auth";
  label: string;
  state: SetupStepState;
  detail: string;
  missing: string[];
};

export type AppSetupStatus = {
  ready: boolean;
  steps: SetupStep[];
};

export function buildAppSetupStatus(options: {
  env: RuntimeEnv;
  settingsRow: JunoLiveServiceSettingsRow | null;
  authConfig: AdminAuthConfig;
}): AppSetupStatus {
  const databaseMissing = options.env.DATABASE_URL ? [] : ["DATABASE_URL"];
  const gmailSettings = resolveGmailIngestSettings(options.env, options.settingsRow);
  const gmailMissing = getMissingGmailIngestSettings(gmailSettings);
  const liveSettings = resolveJunoLiveSettings(options.env, options.settingsRow);
  const junoMissing = [
    liveSettings.loginEmail ? null : "juno_login_email",
    liveSettings.loginPassword ? null : "juno_login_password",
  ].filter((value): value is string => Boolean(value));
  const authMissing =
    options.authConfig.enabled && !isAdminAuthProviderConfigured(options.authConfig)
      ? ["AUTH_ADMIN_KRATOS_PUBLIC_URL", "AUTH_ADMIN_LOGIN_URL", "AUTH_ADMIN_SESSION_COOKIE_NAMES"]
      : [];

  const steps: SetupStep[] = [
    setupStep("database", "Database", databaseMissing, "required for persistence and worker state"),
    setupStep("gmail", "Gmail ingest", gmailMissing, "required for catalog email ingestion"),
    setupStep("juno", "Juno account", junoMissing, "required for live stock lookup"),
    options.authConfig.enabled
      ? setupStep("auth", "Admin auth", authMissing, "enabled external admin gate")
      : {
          id: "auth",
          label: "Admin auth",
          state: "disabled",
          detail: "external admin gate disabled",
          missing: [],
        },
  ];

  return {
    ready: steps.every((step) => step.state !== "missing"),
    steps,
  };
}

function setupStep(
  id: SetupStep["id"],
  label: string,
  missing: string[],
  detail: string,
): SetupStep {
  return {
    id,
    label,
    state: missing.length > 0 ? "missing" : "complete",
    detail,
    missing,
  };
}
