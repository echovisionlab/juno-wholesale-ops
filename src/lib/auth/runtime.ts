import { loadRuntimeEnv } from "@/lib/env";
import { withJunoLiveRepository } from "@/lib/juno-live/repository";
import { ensureDatabaseAuthSecretClient } from "@/lib/settings/repository";
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

async function resolveRuntimeAuth(options: { requestOrigin?: string | null } = {}): Promise<ResolvedRuntimeAuth> {
  const env = loadRuntimeEnv(process.env);
  const settingsRow = await withJunoLiveRepository(env.DATABASE_URL, async (repository, pool) => {
    const row = await repository.getServiceSettingsRow();
    if (!row?.auth_secret && !env.AUTH_SECRET) {
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
  const settings = resolveAppAuthSettings(env, settingsRow, { requestOrigin: options.requestOrigin });
  const missing = getMissingAppAuthSettings(settings);

  return {
    databaseUrl: env.DATABASE_URL,
    settings,
    missing,
  };
}

export async function getRuntimeBetterAuth(options: { requestOrigin?: string | null } = {}) {
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
