import { loadRuntimeEnv } from "@/lib/env";
import { demoResetConfirmFlag, resetDemoData } from "@/lib/demo/repository";

async function main() {
  const env = loadRuntimeEnv();
  const result = await resetDemoData({
    databaseUrl: env.DATABASE_URL,
    confirm: process.argv.includes(demoResetConfirmFlag),
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
