import { requireAdmin } from "@/lib/auth/admin";
import { loadRuntimeEnv } from "@/lib/env";
import { withJunoLiveRepository } from "@/lib/juno-live/repository";
import { buildAppSetupStatus } from "@/lib/setup/status";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authorization = await requireAdmin(request);
  if (!authorization.authorized) {
    return authorization.response;
  }

  const env = loadRuntimeEnv(process.env);
  const settingsRow = env.DATABASE_URL
    ? await withJunoLiveRepository(env.DATABASE_URL, (repository) => repository.getServiceSettingsRow())
    : null;

  return Response.json({
    setup: buildAppSetupStatus({
      env,
      settingsRow,
    }),
  });
}
