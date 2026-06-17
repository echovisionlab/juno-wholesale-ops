import { loadAdminAuthConfig } from "@/lib/auth/admin-auth";
import { loadRuntimeEnv } from "@/lib/env";
import { withJunoLiveRepository } from "@/lib/juno-live/repository";
import { buildAppSetupStatus } from "@/lib/setup/status";

export const dynamic = "force-dynamic";

export async function GET() {
  const env = loadRuntimeEnv(process.env);
  const settingsRow = env.DATABASE_URL
    ? await withJunoLiveRepository(env.DATABASE_URL, (repository) => repository.getServiceSettingsRow())
    : null;

  return Response.json({
    setup: buildAppSetupStatus({
      env,
      settingsRow,
      authConfig: loadAdminAuthConfig(process.env),
    }),
  });
}
