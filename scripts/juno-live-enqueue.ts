import { loadRuntimeEnv } from "@/lib/env";
import { enqueueLiveLookupJobs, withJunoLiveRepository } from "@/lib/juno-live/repository";
import { resolveJunoLiveSettings } from "@/lib/juno-live/settings";

async function main() {
  const env = loadRuntimeEnv();
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }
  const snapshotId = getArgValue("--snapshot-id");
  const limit = Number(getArgValue("--limit") ?? "1000");
  const settings = resolveJunoLiveSettings(
    env,
    await withJunoLiveRepository(env.DATABASE_URL, (repository) => repository.getServiceSettingsRow()),
  );
  const result = await enqueueLiveLookupJobs({
    databaseUrl: env.DATABASE_URL,
    snapshotId: snapshotId ?? null,
    limit,
    maxAttempts: settings.maxAttempts,
  });
  console.log(JSON.stringify(result, null, 2));
}

function getArgValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return null;
  }
  return process.argv[index + 1] ?? null;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
