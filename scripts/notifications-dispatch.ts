import { loadRuntimeEnv } from "@/lib/env";
import { dispatchQueuedNotifications } from "@/lib/notifications/dispatcher";
import { parseNotificationScriptOptions } from "@/lib/notifications/script-options";

async function main() {
  const env = loadRuntimeEnv();
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }
  const options = parseNotificationScriptOptions(process.argv.slice(2));
  const result = await dispatchQueuedNotifications({
    databaseUrl: env.DATABASE_URL,
    mode: options.mode,
    limit: options.limit,
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
