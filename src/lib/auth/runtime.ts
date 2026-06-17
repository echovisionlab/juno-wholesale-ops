import { loadRuntimeEnv } from "@/lib/env";
import { withJunoLiveRepository } from "@/lib/juno-live/repository";
import { getCachedAppAuth } from "./app-auth";
import {
  getMissingAppAuthSettings,
  isAppAuthRunnable,
  resolveAppAuthSettings,
  type AppAuthSettings,
} from "./settings";

export type ResolvedRuntimeAuth = {
  databaseUrl: string | undefined;
  settings: AppAuthSettings;
  missing: string[];
};

async function resolveRuntimeAuth(): Promise<ResolvedRuntimeAuth> {
  const env = loadRuntimeEnv(process.env);
  const settingsRow = env.DATABASE_URL
    ? await withJunoLiveRepository(env.DATABASE_URL, (repository) => repository.getServiceSettingsRow())
    : null;
  const settings = resolveAppAuthSettings(env, settingsRow);
  const missing = [
    env.DATABASE_URL ? null : "DATABASE_URL",
    ...getMissingAppAuthSettings(settings),
  ].filter((value): value is string => Boolean(value));

  return {
    databaseUrl: env.DATABASE_URL,
    settings,
    missing,
  };
}

export async function getRuntimeBetterAuth() {
  const runtime = await resolveRuntimeAuth();

  if (!runtime.settings.enabled) {
    return { runtime, auth: null, unavailable: false };
  }

  if (!runtime.databaseUrl || !isAppAuthRunnable(runtime.settings)) {
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
