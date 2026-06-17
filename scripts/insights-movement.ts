import { loadRuntimeEnv } from "@/lib/env";
import { processMovementSignalsForRecentObservations } from "@/lib/insights/movement-repository";

async function main() {
  const env = loadRuntimeEnv();
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }
  const result = await processMovementSignalsForRecentObservations({
    databaseUrl: env.DATABASE_URL,
    lookbackHours: numberArg("--lookback-hours"),
    lowStockThreshold: numberArg("--low-stock-threshold"),
  });
  console.log(JSON.stringify(result, null, 2));
}

function numberArg(name: string): number | undefined {
  const value = getArgValue(name);
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
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
