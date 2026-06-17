import path from "node:path";
import { Pool } from "pg";
import { seedInitialAdmin } from "@/lib/auth/initial-admin";
import { resolveAppAuthSettings } from "@/lib/auth/settings";
import { applyMigrations } from "@/lib/db/migrations";
import { loadRuntimeEnv } from "@/lib/env";
import { JunoLiveRepository } from "@/lib/juno-live/repository";

async function main() {
  const env = loadRuntimeEnv();
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  const pool = new Pool({ connectionString: env.DATABASE_URL, max: 1 });
  try {
    const applied = await applyMigrations(pool, path.join(process.cwd(), "infra/postgres/migrations"));
    const repository = new JunoLiveRepository(pool);
    const settings = resolveAppAuthSettings(env, await repository.getServiceSettingsRow());
    const initialAdmin = await seedInitialAdmin({
      databaseUrl: env.DATABASE_URL,
      settings,
      pool,
    });

    console.log(JSON.stringify({ applied, initialAdmin }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
