import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations, loadAppliedMigrations } from "@/lib/db/migrations";
import {
  resetApplicationTables,
  startMigratedPostgresTestDatabase,
  type StartedPostgresTestDatabase,
} from "@/test/postgres";
import { enqueueLiveLookupJobs, JunoLiveRepository } from "./repository";

describe("JunoLiveRepository", () => {
  let database: StartedPostgresTestDatabase;
  let repository: JunoLiveRepository;

  beforeAll(async () => {
    database = await startMigratedPostgresTestDatabase();
    repository = new JunoLiveRepository(database.pool);
  });

  beforeEach(async () => {
    await resetApplicationTables(database.pool);
  });

  afterAll(async () => {
    await database.stop();
  });

  it("applies migrations idempotently with a hash ledger", async () => {
    await expect(applyMigrations(database.pool, database.migrationsDir)).resolves.toHaveLength(9);
    await expect(loadAppliedMigrations(database.pool)).resolves.toEqual([
      expect.objectContaining({ version: 1, filename: "0001_init.sql" }),
      expect.objectContaining({ version: 2, filename: "0002_juno_live_lookup.sql" }),
      expect.objectContaining({ version: 3, filename: "0003_service_setting.sql" }),
      expect.objectContaining({ version: 4, filename: "0004_catalog_content_hash_unique.sql" }),
      expect.objectContaining({ version: 5, filename: "0005_ingest_cursor_and_auto_stock.sql" }),
      expect.objectContaining({ version: 6, filename: "0006_configurable_ingest_settings.sql" }),
      expect.objectContaining({ version: 7, filename: "0007_auth_and_email_settings.sql" }),
      expect.objectContaining({ version: 8, filename: "0008_service_setting_guardrails.sql" }),
      expect.objectContaining({ version: 9, filename: "0009_insights_foundation.sql" }),
    ]);
  });

  it("loads the singleton service settings row", async () => {
    await database.pool.query(
      `
        UPDATE service_setting
        SET juno_live_enqueue_on_ingest = true,
            juno_login_email = 'catalog@example.com',
            juno_browser_profile_dir = '/profile',
            juno_browser_headless = true,
            juno_live_concurrency = 6,
            juno_live_delay_min_ms = 15000,
            juno_live_delay_max_ms = 75000,
            juno_live_nav_timeout_ms = 45000,
            juno_live_max_attempts = 2,
            juno_live_auto_enqueue_on_interval = true,
            juno_live_auto_enqueue_limit = 50,
            gmail_ingest_lookback_ms = 86400000,
            google_workspace_delegated_user = 'operator@example.com',
            google_service_account_key_json = '/run/secrets/google.json',
            google_gmail_scopes = 'scope-a scope-b',
            gmail_ingest_query = 'has:attachment filename:xlsx',
            gmail_max_results = 15,
            gmail_processed_label = 'Processed',
            gmail_storage_dir = '/storage',
            catalog_attachment_pattern = 'New Releases',
            supplier_code = 'juno-test',
            auth_enabled = true,
            auth_base_url = 'https://app.example.com',
            auth_trusted_origins = 'https://app.example.com',
            auth_email_password_enabled = true,
            auth_external_provider_enabled = true,
            auth_external_provider_id = 'workspace',
            auth_external_provider_name = 'Workspace',
            auth_external_discovery_url = 'https://login.example.com/.well-known/openid-configuration',
            auth_external_client_id = 'client-id',
            auth_external_client_secret = 'client-secret'
        WHERE id = true
      `,
    );

    await expect(repository.getServiceSettingsRow()).resolves.toMatchObject({
      juno_live_enqueue_on_ingest: true,
      juno_login_email: "catalog@example.com",
      juno_login_password: null,
      juno_browser_profile_dir: "/profile",
      juno_browser_headless: true,
      juno_live_concurrency: 6,
      juno_live_delay_min_ms: 15000,
      juno_live_delay_max_ms: 75000,
      juno_live_nav_timeout_ms: 45000,
      juno_live_max_attempts: 2,
      juno_live_poll_interval_ms: null,
      juno_live_auto_enqueue_on_interval: true,
      juno_live_auto_enqueue_limit: 50,
      gmail_ingest_lookback_ms: 86400000,
      google_workspace_delegated_user: "operator@example.com",
      google_service_account_key_json: "/run/secrets/google.json",
      google_gmail_scopes: "scope-a scope-b",
      gmail_ingest_query: "has:attachment filename:xlsx",
      gmail_max_results: 15,
      gmail_processed_label: "Processed",
      gmail_storage_dir: "/storage",
      catalog_attachment_pattern: "New Releases",
      supplier_code: "juno-test",
      auth_enabled: true,
      auth_base_url: "https://app.example.com",
      auth_trusted_origins: "https://app.example.com",
      auth_email_password_enabled: true,
      auth_external_provider_enabled: true,
      auth_external_provider_id: "workspace",
      auth_external_provider_name: "Workspace",
      auth_external_discovery_url: "https://login.example.com/.well-known/openid-configuration",
      auth_external_client_id: "client-id",
      auth_external_client_secret: "client-secret",
    });
  });

  it("creates and finishes runs", async () => {
    const runId = await repository.createRun("manual", "worker-1");
    await repository.finishRun(runId, "succeeded", { completed: 1 }, null);

    const result = await database.pool.query<{ status: string; summary: { completed: number } }>(
      "SELECT status, summary FROM juno_live_lookup_run WHERE id = $1",
      [runId],
    );

    expect(result.rows[0]).toEqual({ status: "succeeded", summary: { completed: 1 } });
  });

  it("enqueues unique Juno IDs from the latest snapshot and claims jobs", async () => {
    const snapshotId = await seedCatalogSnapshot([
      { rowNumber: 1, junoId: "1148569-01" },
      { rowNumber: 2, junoId: "1148569-01" },
      { rowNumber: 3, junoId: "1148570-01" },
    ]);

    const enqueueResult = await enqueueLiveLookupJobs({
      databaseUrl: database.container.getConnectionUri(),
      snapshotId,
      limit: 100,
      maxAttempts: 4,
    });
    const duplicateEnqueueResult = await enqueueLiveLookupJobs({
      databaseUrl: database.container.getConnectionUri(),
      snapshotId,
      limit: 100,
      maxAttempts: 4,
    });
    const claimed = await repository.claimJobs(6, "worker-1");

    expect(enqueueResult.jobs.map((job) => job.junoId).sort()).toEqual(["1148569-01", "1148570-01"]);
    expect(duplicateEnqueueResult.enqueued).toBe(0);
    expect([...claimed].sort((left, right) => left.junoId.localeCompare(right.junoId))).toEqual([
      expect.objectContaining({ junoId: "1148569-01", attempts: 1, maxAttempts: 4 }),
      expect.objectContaining({ junoId: "1148570-01", attempts: 1, maxAttempts: 4 }),
    ]);
  });

  it("records observations inside a transaction and completes the job", async () => {
    const runId = await repository.createRun("manual", "worker-1");
    const jobId = await insertLookupJob("1148569-01");

    await repository.recordObservationAndComplete(runId, {
      jobId,
      junoId: "1148569-01",
      catalogItemRawId: null,
      status: "unknown",
      stockQuantity: null,
      stockText: null,
      displayStock: "N/A",
      wholesalePriceGbp: null,
      productUrl: "https://www.juno.co.uk/products/1148569-01/",
      finalUrl: "https://www.juno.co.uk/products/9ms-lunch-vinyl/1148569-01/",
      parserVersion: "v1",
      durationMs: 25,
      error: null,
      metadata: { hasPriceMatch: false },
    });

    const job = await database.pool.query<{ status: string }>("SELECT status FROM juno_live_lookup_job WHERE id = $1", [
      jobId,
    ]);
    const observation = await database.pool.query<{ display_stock: string; final_url: string }>(
      "SELECT display_stock, final_url FROM juno_live_observation WHERE job_id = $1",
      [jobId],
    );

    expect(job.rows[0].status).toBe("succeeded");
    expect(observation.rows[0]).toEqual({
      display_stock: "N/A",
      final_url: "https://www.juno.co.uk/products/9ms-lunch-vinyl/1148569-01/",
    });
  });

  it("updates retry, failed, blocked, and summary states", async () => {
    const retryJobId = await insertLookupJob("retry-1");
    const failedJobId = await insertLookupJob("failed-1");
    const blockedJobId = await insertLookupJob("blocked-1");
    const runId = await repository.createRun("manual", "worker-1");

    await repository.markJobForRetry(retryJobId, "timeout", 30000);
    await repository.markJobFailed(failedJobId, "failed");
    await repository.markJobBlocked(blockedJobId, "manual_required", "login");
    await repository.recordObservationAndComplete(runId, {
      jobId: retryJobId,
      junoId: "retry-1",
      catalogItemRawId: null,
      status: "in_stock",
      stockQuantity: 2,
      stockText: "2 in stock",
      displayStock: "2 in stock",
      wholesalePriceGbp: 20.63,
      productUrl: "https://www.juno.co.uk/products/retry-1/",
      finalUrl: "https://www.juno.co.uk/products/retry-1/",
      parserVersion: "v1",
      durationMs: 25,
      error: null,
      metadata: {},
    });

    await expect(repository.getSummary()).resolves.toMatchObject({
      queued: 0,
      running: 0,
      succeeded: 1,
      failed: 1,
      blocked: 0,
      manualRequired: 1,
      latestDisplayStock: "2 in stock",
    });
  });

  async function insertLookupJob(junoId: string): Promise<string> {
    const result = await database.pool.query<{ id: string }>(
      "INSERT INTO juno_live_lookup_job (juno_id) VALUES ($1) RETURNING id",
      [junoId],
    );
    return result.rows[0].id;
  }

  async function seedCatalogSnapshot(items: Array<{ rowNumber: number; junoId: string }>): Promise<string> {
    const supplier = await database.pool.query<{ id: string }>(
      "INSERT INTO supplier (code, name) VALUES ('juno', 'Juno') RETURNING id",
    );
    const message = await database.pool.query<{ id: string }>(
      `
        INSERT INTO mail_message (gmail_user_email, gmail_message_id, payload)
        VALUES ('operator@example.com', 'message-1', '{}')
        RETURNING id
      `,
    );
    const attachment = await database.pool.query<{ id: string }>(
      `
        INSERT INTO mail_attachment (message_id, filename, mime_type, byte_size, sha256, storage_uri)
        VALUES ($1, 'catalog.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 10, 'hash', '/tmp/catalog.xlsx')
        RETURNING id
      `,
      [message.rows[0].id],
    );
    const snapshot = await database.pool.query<{ id: string }>(
      `
        INSERT INTO catalog_snapshot (
          supplier_id,
          catalog_kind,
          source_filename,
          source_attachment_id,
          content_hash,
          row_count
        )
        VALUES ($1, 'in_stock', 'catalog.xlsx', $2, 'content-hash', $3)
        RETURNING id
      `,
      [supplier.rows[0].id, attachment.rows[0].id, items.length],
    );

    for (const item of items) {
      await database.pool.query(
        `
          INSERT INTO catalog_item_raw (snapshot_id, row_number, juno_id, raw)
          VALUES ($1, $2, $3, '{}')
        `,
        [snapshot.rows[0].id, item.rowNumber, item.junoId],
      );
    }

    return snapshot.rows[0].id;
  }
});
