import { loadRuntimeEnv } from "@/lib/env";
import { withJunoLiveRepository } from "@/lib/juno-live/repository";
import { ensureDatabaseAuthSecretClient } from "@/lib/settings/repository";
import { listSsoProviders } from "./sso-provider-repository";
import { getCachedAppAuth } from "./app-auth";
import {
  getMissingAppAuthSettings,
  isAppAuthRunnable,
  resolveAppAuthSettings,
  type AppAuthSettings,
} from "./settings";

export type ResolvedRuntimeAuth = {
  databaseUrl: string;
  settings: AppAuthSettings;
  missing: string[];
};

export type RuntimeAuthOptions = {
  requestOrigin?: string | null;
};

async function resolveRuntimeAuth(options: RuntimeAuthOptions = {}): Promise<ResolvedRuntimeAuth> {
  const env = loadRuntimeEnv(process.env);
  const settingsRow = await withJunoLiveRepository(env.DATABASE_URL, async (repository, pool) => {
    const row = await repository.getServiceSettingsRow();
    if (!row?.auth_secret) {
      const authSecret = await ensureDatabaseAuthSecretClient(pool);
      const refreshedRow = row ?? await repository.getServiceSettingsRow();
      if (!refreshedRow) {
        throw new Error("service_setting row was not available after auth secret initialization");
      }
      return {
        ...refreshedRow,
        auth_secret: authSecret,
      };
    }
    return row;
  });
  const ssoProviders = await listSsoProviders(env.DATABASE_URL);
  const resolvedSettings = resolveAppAuthSettings(env, settingsRow, { ssoProviders, rawEnv: process.env });
  const requestOrigin = normalizeOrigin(options.requestOrigin);
  const settings = resolvedSettings.baseUrl || !requestOrigin
    ? resolvedSettings
    : {
        ...resolvedSettings,
        baseUrl: requestOrigin,
      };
  const missing = getMissingAppAuthSettings(settings);

  return {
    databaseUrl: env.DATABASE_URL,
    settings,
    missing,
  };
}

export async function getRuntimeBetterAuth(options: RuntimeAuthOptions = {}) {
  const runtime = await resolveRuntimeAuth(options);

  if (!isAppAuthRunnable(runtime.settings)) {
    return { runtime, auth: null, unavailable: true };
  }

  return {
    runtime,
    auth: await getCachedAppAuth({
      databaseUrl: runtime.databaseUrl,
      settings: runtime.settings,
    }),
    unavailable: false,
  };
}

function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}
