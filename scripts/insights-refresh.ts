import { loadRuntimeEnv } from "@/lib/env";
import { processMovementSignalsForRecentObservations } from "@/lib/insights/movement-repository";
import { refreshCatalogTrendSignals } from "@/lib/insights/trend-repository";

async function main() {
  const env = loadRuntimeEnv();
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }
  const movement = await processMovementSignalsForRecentObservations({
    databaseUrl: env.DATABASE_URL,
  });
  const trends = await refreshCatalogTrendSignals({
    databaseUrl: env.DATABASE_URL,
  });
  console.log(JSON.stringify({ movement, trends }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
