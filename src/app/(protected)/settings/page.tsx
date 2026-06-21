import { SettingsCenter } from "@/features/settings/SettingsCenter";
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
  return (
    <SettingsCenter
      key={settingsCenterKey(initial)}
      initialSettings={initial.settings}
      initialError={initial.error}
    />
  );
}

function settingsCenterKey(initial: { settings: SettingsResponse | null; error: string | null }): string {
  if (!initial.settings) {
    return `error:${initial.error ?? "none"}`;
  }
  const settings = initial.settings;
  return [
    settings.environment.lastUpdatedAt ?? "no-settings-row-update",
    settings.environment.appBaseUrl ?? "no-site-address",
    settings.security.authBootstrap.adminUserCount ?? "unknown-admin-count",
    settings.units.authProvider.providers
      .map((provider) =>
        [
          provider.id,
          provider.providerId,
          provider.displayName,
          provider.buttonLabel,
          provider.enabled,
          provider.status,
          provider.clientId ?? "",
          provider.clientSecretConfigured,
          provider.callbackUrl ?? "",
        ].join(":"),
      )
      .join("|"),
    settings.mailSources
      .map((source) =>
        [
          source.id,
          source.name,
          source.provider,
          source.mailboxAddress,
          source.query,
          source.isActive,
          source.credentialConfigured,
          source.storageBackend,
          source.storageBucket,
          source.storagePrefix,
          source.storageSecretConfigured,
        ].join(":"),
      )
      .join("|"),
    settings.warnings.map((warning) => `${warning.id}:${warning.severity}`).join("|"),
  ].join("::");
}

async function loadInitialSettings(): Promise<{ settings: SettingsResponse | null; error: string | null }> {
  const requestHeaders = await headers();

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

function safeInitialSettingsError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Settings Center could not load operator configuration.";
  }
  return error.message.replace(/\{[^{}]*(?:private_key|client_email|token|password|secret)[^{}]*\}/gi, "[redacted]");
}
