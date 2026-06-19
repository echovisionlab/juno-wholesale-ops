import path from "node:path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { applyMigrations } from "@/lib/db/migrations";

const testPostgresImage = "postgres:16-alpine";
const testMailConnectionId = "10000000-0000-4000-8000-000000000100";
export const testMailboxSourceId = "10000000-0000-4000-8000-000000000101";

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
      notification_delivery,
      notification_rule,
      notification_channel,
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
      mail_mailbox_ingest_state,
      mail_mailbox_source,
      mail_connection,
      auth_sso_admin_rule,
      auth_sso_provider,
      supplier,
      processing_run
    RESTART IDENTITY CASCADE
  `);
  await pool.query("DELETE FROM service_setting");
  await pool.query("INSERT INTO service_setting (id) VALUES (true)");
  await pool.query(
    `
      INSERT INTO mail_connection (id, name, provider, auth_type, credential_type, credential_secret, is_active, config)
      VALUES (
        $1,
        'Test Gmail',
        'gmail',
        'google_workspace_delegation',
        'google_service_account_json',
        '{"client_email":"test@example.com","fixture_key":"synthetic-test-key"}',
        true,
        '{"scopes":"https://www.googleapis.com/auth/gmail.readonly"}'
      )
    `,
    [testMailConnectionId],
  );
  await pool.query(
    `
      INSERT INTO mail_mailbox_source (
        id,
        connection_id,
        mailbox_address,
        display_name,
        ingest_query,
        storage_dir,
        attachment_pattern,
        supplier_code,
        is_active
      )
      VALUES ($1,$2,'operator@example.com','Operator','filename:xlsx','.data/test-mail','xlsx','juno',true)
    `,
    [testMailboxSourceId, testMailConnectionId],
  );
  await pool.query(`
    INSERT INTO notification_channel (name, type, enabled, config)
    VALUES ('In-app notifications', 'in_app', true, '{}')
    ON CONFLICT (name) DO NOTHING
  `);
}
