import { loadRuntimeEnv } from "@/lib/env";
import { runGmailIngest } from "@/lib/ingest/gmail-ingest-runner";
import { listActiveMailboxSources } from "@/lib/ingest/settings";
import { withJunoLiveRepository } from "@/lib/juno-live/repository";
import { resolveJunoLiveSettings } from "@/lib/juno-live/settings";

async function main() {
  const writeMode = process.argv.includes("--write");
  const labelMode = process.argv.includes("--label");
  const env = loadRuntimeEnv();
  const databaseUrl = env.DATABASE_URL;
  const settingsRow =
    writeMode
      ? await withJunoLiveRepository(databaseUrl, (repository) => repository.getServiceSettingsRow())
      : null;
  const liveSettings =
    writeMode
      ? resolveJunoLiveSettings(settingsRow)
      : resolveJunoLiveSettings(null);
  const sources = await listActiveMailboxSources(databaseUrl);
  const result = await runGmailIngest({
    databaseUrl,
    sources,
    writeMode,
    labelMode,
    liveSettings,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
