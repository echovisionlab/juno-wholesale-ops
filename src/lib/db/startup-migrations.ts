import path from "node:path";
import { Pool } from "pg";
import { loadRuntimeEnv } from "@/lib/env";
import { applyMigrations, type AppliedMigration } from "./migrations";

export type StartupMigrationResult =
  | {
      status: "skipped";
      reason: "missing_database_url";
    }
  | {
      status: "applied";
      migrationCount: number;
      latestVersion: number | null;
    };

export type StartupMigrationLogger = Pick<Console, "error" | "info">;

export async function runStartupMigrations(options: {
  env?: Record<string, string | boolean | number | undefined>;
  logger?: StartupMigrationLogger;
  migrate?: (pool: Pool, migrationsDir: string) => Promise<AppliedMigration[]>;
  migrationsDir?: string;
} = {}): Promise<StartupMigrationResult> {
  const env = loadRuntimeEnv(options.env ?? process.env);

  if (!env.DATABASE_URL) {
    return { status: "skipped", reason: "missing_database_url" };
  }

  const logger = options.logger ?? console;
  const migrate = options.migrate ?? applyMigrations;
  const migrationsDir = options.migrationsDir ?? path.join(process.cwd(), "infra/postgres/migrations");
  const pool = new Pool({ connectionString: env.DATABASE_URL, max: 1 });

  try {
    const migrations = await migrate(pool, migrationsDir);
    const latestVersion = migrations.length > 0 ? migrations[migrations.length - 1].version : null;
    logger.info(JSON.stringify({ event: "database_migrations_ready", migrationCount: migrations.length, latestVersion }));
    return {
      status: "applied",
      migrationCount: migrations.length,
      latestVersion,
    };
  } catch (error) {
    logger.error(
      JSON.stringify({
        event: "database_migrations_failed",
        error: error instanceof Error ? error.message : "Unknown startup migration error",
      }),
    );
    throw error;
  } finally {
    await pool.end();
  }
}
