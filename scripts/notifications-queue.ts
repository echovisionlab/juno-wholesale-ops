import { loadRuntimeEnv } from "@/lib/env";
import { matchNotificationRulesForSignals } from "@/lib/notifications/repository";
import { parseNotificationScriptOptions } from "@/lib/notifications/script-options";

async function main() {
  const env = loadRuntimeEnv();
  const options = parseNotificationScriptOptions(process.argv.slice(2));
  const result = await matchNotificationRulesForSignals({
    databaseUrl: env.DATABASE_URL,
    limit: options.limit,
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
