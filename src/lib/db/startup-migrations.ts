import path from "node:path";
import { Pool } from "pg";
import { seedInitialAdmin, type SeedInitialAdminResult } from "@/lib/auth/initial-admin";
import { resolveAppAuthSettings } from "@/lib/auth/settings";
import { JunoLiveRepository } from "@/lib/juno-live/repository";
import { loadRuntimeEnv } from "@/lib/env";
import { ensureDatabaseAuthSecretClient } from "@/lib/settings/repository";
import { applyMigrations, type AppliedMigration } from "./migrations";

export type StartupMigrationResult =
  {
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

  const logger = options.logger ?? console;
  const migrate = options.migrate ?? applyMigrations;
  const migrationsDir = options.migrationsDir ?? path.join(process.cwd(), "infra/postgres/migrations");
  const pool = new Pool({ connectionString: env.DATABASE_URL, max: 1 });

  try {
    const migrations = await migrate(pool, migrationsDir);
    const repository = new JunoLiveRepository(pool);
    await ensureDatabaseAuthSecretClient(pool);
    const initialAdmin = await seedInitialAdmin({
      databaseUrl: env.DATABASE_URL,
      settings: resolveAppAuthSettings(env, await repository.getServiceSettingsRow()),
      pool,
    });
    const latestVersion = migrations.length > 0 ? migrations[migrations.length - 1].version : null;
    logger.info(JSON.stringify({ event: "database_migrations_ready", migrationCount: migrations.length, latestVersion }));
    logInitialAdminResult(logger, initialAdmin);
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

export function logInitialAdminResult(logger: StartupMigrationLogger, result: SeedInitialAdminResult): void {
  if (result.status !== "created") {
    logger.info(JSON.stringify({ event: "initial_admin_ready", status: result.status, reason: result.reason }));
    return;
  }
  if (result.source === "generated") {
    logger.info(JSON.stringify({
      event: "initial_admin_generated",
      email: result.email,
      password: result.password,
      message: "Store this generated admin password now. It is logged only when the account is created.",
    }));
    return;
  }
  logger.info(JSON.stringify({ event: "initial_admin_seeded", email: result.email }));
}
