import path from "node:path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { applyMigrations } from "@/lib/db/migrations";

const testPostgresImage = "postgres:16-alpine";

export type StartedPostgresTestDatabase = {
  container: StartedPostgreSqlContainer;
  pool: Pool;
  migrationsDir: string;
  stop(): Promise<void>;
};

export async function startMigratedPostgresTestDatabase(): Promise<StartedPostgresTestDatabase> {
  const container = await new PostgreSqlContainer(testPostgresImage).start();
  const pool = new Pool({ connectionString: container.getConnectionUri(), max: 4 });
  const migrationsDir = path.join(process.cwd(), "infra/postgres/migrations");
  await applyMigrations(pool, migrationsDir);

  return {
    container,
    pool,
    migrationsDir,
    async stop() {
      await pool.end();
      await container.stop();
    },
  };
}

export async function resetApplicationTables(pool: Pool): Promise<void> {
  await pool.query(`
    TRUNCATE
      juno_live_observation,
      juno_live_lookup_job,
      juno_live_lookup_run,
      signal_event,
      watch_match,
      watch_rule,
      catalog_item_raw,
      catalog_item_identity,
      catalog_snapshot,
      mail_attachment,
      mail_message,
      supplier,
      processing_run,
      gmail_ingest_state
    RESTART IDENTITY CASCADE
  `);
  await pool.query("DELETE FROM service_setting");
  await pool.query("INSERT INTO service_setting (id) VALUES (true)");
  await pool.query("INSERT INTO gmail_ingest_state (id) VALUES (true)");
}
