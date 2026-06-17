import path from "node:path";
import { Pool } from "pg";
import { applyMigrations } from "@/lib/db/migrations";
import { loadRuntimeEnv } from "@/lib/env";

async function main() {
  const env = loadRuntimeEnv();
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  const pool = new Pool({ connectionString: env.DATABASE_URL, max: 1 });
  try {
    const applied = await applyMigrations(pool, path.join(process.cwd(), "infra/postgres/migrations"));
    console.log(JSON.stringify({ applied }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
