import { loadRuntimeEnv } from "@/lib/env";
import { seedDemoData } from "@/lib/demo/repository";

async function main() {
  const env = loadRuntimeEnv();
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }
  const result = await seedDemoData({ databaseUrl: env.DATABASE_URL });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
