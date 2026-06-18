import { requireAdmin } from "@/lib/auth/admin";
import { getDatabaseUrl, loadRuntimeEnv } from "@/lib/env";
import { enqueueLiveLookupJobs, withJunoLiveRepository } from "@/lib/juno-live/repository";
import { resolveJunoLiveSettings } from "@/lib/juno-live/settings";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authorization = await requireAdmin(request);
  if (!authorization.authorized) {
    return authorization.response;
  }

  const databaseUrl = getDatabaseUrl();
  const env = loadRuntimeEnv(process.env);
  const settings = resolveJunoLiveSettings(
    env,
    await withJunoLiveRepository(databaseUrl, (repository) => repository.getServiceSettingsRow()),
  );
  const body = await request.json().catch(() => ({}));
  const result = await enqueueLiveLookupJobs({
    databaseUrl,
    snapshotId: typeof body.snapshotId === "string" ? body.snapshotId : null,
    limit: parsePositiveInteger(body.limit, 1000),
    maxAttempts: settings.maxAttempts,
  });
  return Response.json(result);
}

function parsePositiveInteger(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
