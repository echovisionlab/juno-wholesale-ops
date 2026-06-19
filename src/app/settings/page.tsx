import { SettingsPage } from "@/components/settings/SettingsPage";
import { requireAdmin } from "@/lib/auth/admin";
import { listSsoProviders } from "@/lib/auth/sso-provider-repository";
import { getDatabaseUrl, loadRuntimeEnv } from "@/lib/env";
import { listMailboxSources, redactMailboxSource } from "@/lib/ingest/mail-source";
import { countAdminUsers, ensureServiceSettingsRow } from "@/lib/settings/repository";
import { buildSettingsResponse } from "@/lib/settings/response";
import type { SettingsResponse } from "@/lib/settings/descriptors";
import { headers } from "next/headers";
import { getRequestOrigin } from "@/lib/http/request-origin";

export const dynamic = "force-dynamic";

export default async function Page() {
  const initial = await loadInitialSettings();
  return <SettingsPage initialSettings={initial.settings} initialError={initial.error} />;
}

async function loadInitialSettings(): Promise<{ settings: SettingsResponse | null; error: string | null }> {
  const requestHeaders = await headers();
  const authorization = await requireAdmin(new Request("http://localhost/settings", { headers: requestHeaders }));
  if (!authorization.authorized) {
    return { settings: null, error: await describeAuthorizationFailure(authorization.response) };
  }

  try {
    const databaseUrl = getDatabaseUrl();
    const env = loadRuntimeEnv(process.env);
    const settingsRow = await ensureServiceSettingsRow(databaseUrl);
    const request = new Request("http://localhost/settings", { headers: requestHeaders });
    const adminUserCount = await countAdminUsers(databaseUrl).catch(() => null);
    const mailSources = (await listMailboxSources(databaseUrl)).map(redactMailboxSource);
    const ssoProviders = await listSsoProviders(databaseUrl);
    return {
      settings: buildSettingsResponse({
        env,
        rawEnv: process.env,
        settingsRow,
        nodeEnv: process.env.NODE_ENV ?? "development",
        currentRequestOrigin: getRequestOrigin(request),
        adminUserCount,
        mailSources,
        ssoProviders,
      }),
      error: null,
    };
  } catch (error: unknown) {
    return { settings: null, error: safeInitialSettingsError(error) };
  }
}

async function describeAuthorizationFailure(response: Response): Promise<string> {
  const payload = (await response.clone().json().catch(() => ({}))) as { error?: string; missing?: string[] };
  if (response.status === 401) {
    return "Authentication is required before Settings Center can load operator configuration.";
  }
  if (response.status === 403) {
    return "Admin access is required before Settings Center can load operator configuration.";
  }
  if (payload.error === "auth_unavailable") {
    return `Auth is enabled but unavailable. Missing: ${payload.missing?.join(", ") || "required auth settings"}.`;
  }
  return payload.error ?? `Settings authorization failed with HTTP ${response.status}.`;
}

function safeInitialSettingsError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Settings Center could not load operator configuration.";
  }
  return error.message.replace(/\{[^{}]*(?:private_key|client_email|token|password|secret)[^{}]*\}/gi, "[redacted]");
}
