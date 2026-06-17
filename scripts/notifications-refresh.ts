import { loadRuntimeEnv } from "@/lib/env";
import { dispatchQueuedNotifications } from "@/lib/notifications/dispatcher";
import { matchNotificationRulesForSignals } from "@/lib/notifications/repository";
import { parseNotificationScriptOptions } from "@/lib/notifications/script-options";

async function main() {
  const env = loadRuntimeEnv();
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }
  const options = parseNotificationScriptOptions(process.argv.slice(2));
  const queued = await matchNotificationRulesForSignals({
    databaseUrl: env.DATABASE_URL,
    limit: options.limit,
  });
  const dispatched = await dispatchQueuedNotifications({
    databaseUrl: env.DATABASE_URL,
    mode: options.mode,
    limit: options.limit,
  });
  console.log(JSON.stringify({ queued, dispatched }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
