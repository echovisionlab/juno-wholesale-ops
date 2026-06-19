import { Pool, type PoolClient } from "pg";
import { resolveLiveObservationIdentityIdClient } from "@/lib/insights/movement-repository";
import type { LiveLookupJob, LiveLookupObservationInput } from "./lookup-runner";
import type { JunoLiveServiceSettingsRow } from "./settings";

export type LookupRunStatus = "running" | "succeeded" | "failed";

export type ClaimedLiveLookupJob = LiveLookupJob;

export type LiveLookupSummary = {
  queued: number;
  running: number;
  succeeded: number;
  failed: number;
  blocked: number;
  manualRequired: number;
  latestObservedAt: string | null;
  latestDisplayStock: string | null;
};

export type EnqueueLiveLookupOptions = {
  databaseUrl: string;
  snapshotId?: string | null;
  limit?: number;
  maxAttempts: number;
};

export async function enqueueLiveLookupJobs(
  options: EnqueueLiveLookupOptions,
): Promise<{ enqueued: number; jobs: Array<{ id: string; junoId: string }> }> {
  const pool = new Pool({ connectionString: options.databaseUrl, max: 2 });
  try {
    const result = await pool.query<{ id: string; juno_id: string }>(
      `
        WITH latest_snapshot AS (
          SELECT id
          FROM catalog_snapshot
          WHERE ($1::uuid IS NULL OR id = $1::uuid)
          ORDER BY created_at DESC
          LIMIT 1
        ),
        source_items AS (
          SELECT DISTINCT ON (catalog_item_raw.juno_id)
            catalog_item_raw.juno_id,
            catalog_item_raw.id AS catalog_item_raw_id
          FROM catalog_item_raw
          JOIN latest_snapshot ON latest_snapshot.id = catalog_item_raw.snapshot_id
          WHERE catalog_item_raw.juno_id IS NOT NULL
          ORDER BY catalog_item_raw.juno_id, catalog_item_raw.row_number
          LIMIT $2
        )
        INSERT INTO juno_live_lookup_job (juno_id, catalog_item_raw_id, max_attempts)
        SELECT source_items.juno_id, source_items.catalog_item_raw_id, $3
        FROM source_items
        WHERE NOT EXISTS (
          SELECT 1
          FROM juno_live_lookup_job active_jobs
          WHERE active_jobs.juno_id = source_items.juno_id
            AND active_jobs.status IN ('queued', 'running')
        )
        RETURNING id, juno_id
      `,
      [options.snapshotId ?? null, options.limit ?? 1000, options.maxAttempts],
    );
    return {
      enqueued: result.rowCount ?? 0,
      jobs: result.rows.map((row) => ({ id: row.id, junoId: row.juno_id })),
    };
  } finally {
    await pool.end();
  }
}

export class JunoLiveRepository {
  constructor(private readonly pool: Pool) {}

  async getServiceSettingsRow(): Promise<JunoLiveServiceSettingsRow | null> {
    const result = await this.pool.query<JunoLiveServiceSettingsRow>(
      `
        SELECT
          data_mode,
          juno_live_enqueue_on_ingest,
          juno_login_email,
          juno_login_password,
          juno_browser_profile_dir,
          juno_browser_headless,
          juno_live_concurrency,
          juno_live_delay_min_ms,
          juno_live_delay_max_ms,
          juno_live_nav_timeout_ms,
          juno_live_max_attempts,
          juno_live_poll_interval_ms,
          juno_live_auto_enqueue_on_interval,
          juno_live_auto_enqueue_limit,
          auth_secret,
          auth_base_url,
          auth_trusted_origins,
          auth_email_password_login_enabled,
          auth_login_logo_url,
          updated_at
        FROM service_setting
        WHERE id = true
        LIMIT 1
      `,
    );
    return result.rows[0] ?? null;
  }

  async createRun(triggerSource: string, workerId: string): Promise<string> {
    const result = await this.pool.query<{ id: string }>(
      `
        INSERT INTO juno_live_lookup_run (trigger_source, status, worker_id)
        VALUES ($1, 'running', $2)
        RETURNING id
      `,
      [triggerSource, workerId],
    );
    return result.rows[0].id;
  }

  async finishRun(runId: string, status: LookupRunStatus, summary: Record<string, unknown>, error: string | null): Promise<void> {
    await this.pool.query(
      `
        UPDATE juno_live_lookup_run
        SET status = $2,
            finished_at = now(),
            summary = $3,
            error = $4
        WHERE id = $1
      `,
      [runId, status, JSON.stringify(summary), error],
    );
  }

  async claimJobs(limit: number, workerId: string): Promise<ClaimedLiveLookupJob[]> {
    const result = await this.pool.query<{
      id: string;
      juno_id: string;
      catalog_item_raw_id: string | null;
      attempts: number;
      max_attempts: number;
    }>(
      `
        WITH candidates AS (
          SELECT id
          FROM juno_live_lookup_job
          WHERE status = 'queued'
            AND not_before <= now()
          ORDER BY priority DESC, created_at
          FOR UPDATE SKIP LOCKED
          LIMIT $1
        )
        UPDATE juno_live_lookup_job
        SET status = 'running',
            attempts = attempts + 1,
            locked_at = now(),
            locked_by = $2,
            updated_at = now()
        FROM candidates
        WHERE juno_live_lookup_job.id = candidates.id
        RETURNING
          juno_live_lookup_job.id,
          juno_live_lookup_job.juno_id,
          juno_live_lookup_job.catalog_item_raw_id,
          juno_live_lookup_job.attempts,
          juno_live_lookup_job.max_attempts
      `,
      [limit, workerId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      junoId: row.juno_id,
      catalogItemRawId: row.catalog_item_raw_id,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
    }));
  }

  async recordObservationAndComplete(runId: string, observation: LiveLookupObservationInput): Promise<void> {
    const client = await this.pool.connect();
    try {
      await withTransaction(client, async () => {
        const identityId = await resolveLiveObservationIdentityIdClient(client, {
          catalogItemRawId: observation.catalogItemRawId,
          junoId: observation.junoId,
        });
        await client.query(
          `
            INSERT INTO juno_live_observation (
              job_id,
              run_id,
              juno_id,
              catalog_item_raw_id,
              status,
              stock_quantity,
              stock_text,
              display_stock,
              wholesale_price_gbp,
              product_url,
              final_url,
              parser_version,
              duration_ms,
              error,
              metadata,
              identity_id
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
          `,
          [
            observation.jobId,
            runId,
            observation.junoId,
            observation.catalogItemRawId,
            observation.status,
            observation.stockQuantity,
            observation.stockText,
            observation.displayStock,
            observation.wholesalePriceGbp,
            observation.productUrl,
            observation.finalUrl,
            observation.parserVersion,
            observation.durationMs,
            observation.error,
            JSON.stringify(observation.metadata),
            identityId,
          ],
        );
        await client.query(
          `
            UPDATE juno_live_lookup_job
            SET status = 'succeeded',
                locked_at = NULL,
                locked_by = NULL,
                last_error = NULL,
                updated_at = now()
            WHERE id = $1
          `,
          [observation.jobId],
        );
      });
    } finally {
      client.release();
    }
  }

  async markJobForRetry(jobId: string, error: string, delayMs: number): Promise<void> {
    await this.pool.query(
      `
        UPDATE juno_live_lookup_job
        SET status = 'queued',
            not_before = now() + ($2::text || ' milliseconds')::interval,
            locked_at = NULL,
            locked_by = NULL,
            last_error = $3,
            updated_at = now()
        WHERE id = $1
      `,
      [jobId, delayMs, error],
    );
  }

  async markJobFailed(jobId: string, error: string): Promise<void> {
    await this.pool.query(
      `
        UPDATE juno_live_lookup_job
        SET status = 'failed',
            locked_at = NULL,
            locked_by = NULL,
            last_error = $2,
            updated_at = now()
        WHERE id = $1
      `,
      [jobId, error],
    );
  }

  async markJobBlocked(jobId: string, status: "blocked" | "manual_required", error: string): Promise<void> {
    await this.pool.query(
      `
        UPDATE juno_live_lookup_job
        SET status = $2,
            locked_at = NULL,
            locked_by = NULL,
            last_error = $3,
            updated_at = now()
        WHERE id = $1
      `,
      [jobId, status, error],
    );
  }

  async getSummary(): Promise<LiveLookupSummary> {
    const counts = await this.pool.query<{ status: string; count: string }>(
      `
        SELECT status, count(*)::text AS count
        FROM juno_live_lookup_job
        GROUP BY status
      `,
    );
    const latest = await this.pool.query<{ observed_at: string; display_stock: string }>(
      `
        SELECT observed_at::text, display_stock
        FROM juno_live_observation
        ORDER BY observed_at DESC
        LIMIT 1
      `,
    );
    const countByStatus = Object.fromEntries(counts.rows.map((row) => [row.status, Number(row.count)]));
    return {
      queued: countByStatus.queued ?? 0,
      running: countByStatus.running ?? 0,
      succeeded: countByStatus.succeeded ?? 0,
      failed: countByStatus.failed ?? 0,
      blocked: countByStatus.blocked ?? 0,
      manualRequired: countByStatus.manual_required ?? 0,
      latestObservedAt: latest.rows[0]?.observed_at ?? null,
      latestDisplayStock: latest.rows[0]?.display_stock ?? null,
    };
  }
}

export async function withJunoLiveRepository<T>(
  databaseUrl: string,
  fn: (repository: JunoLiveRepository, pool: Pool) => Promise<T>,
): Promise<T> {
  const pool = new Pool({ connectionString: databaseUrl, max: 6 });
  try {
    return await fn(new JunoLiveRepository(pool), pool);
  } finally {
    await pool.end();
  }
}

async function withTransaction<T>(client: PoolClient, fn: () => Promise<T>): Promise<T> {
  await client.query("BEGIN");
  try {
    const result = await fn();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
