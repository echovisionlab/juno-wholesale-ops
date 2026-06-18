import { loadRuntimeEnv } from "@/lib/env";
import { getCatalogTrends, refreshCatalogTrendSignals } from "@/lib/insights/trend-repository";

async function main() {
  const env = loadRuntimeEnv();
  const options = {
    databaseUrl: env.DATABASE_URL,
    windowDays: numberArg("--window-days"),
    previousWindowDays: numberArg("--previous-window-days"),
    limit: numberArg("--limit"),
  };
  const [refresh, trends] = await Promise.all([
    refreshCatalogTrendSignals(options),
    getCatalogTrends(options),
  ]);
  console.log(JSON.stringify({ refresh, trends }, null, 2));
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
