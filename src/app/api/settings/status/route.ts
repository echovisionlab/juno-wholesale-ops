import { requireAdmin } from "@/lib/auth/admin";
import { loadRuntimeEnv } from "@/lib/env";
import { withJunoLiveRepository } from "@/lib/juno-live/repository";
import { countAdminUsers } from "@/lib/settings/repository";
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
  const adminUserCount = env.DATABASE_URL ? await countAdminUsers(env.DATABASE_URL).catch(() => null) : null;

  return Response.json({
    setup: buildAppSetupStatus({
      env,
      settingsRow,
      adminUserCount,
    }),
  });
}
