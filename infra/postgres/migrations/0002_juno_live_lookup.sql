BEGIN;

CREATE TABLE juno_live_lookup_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_source text NOT NULL,
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  worker_id text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  summary jsonb NOT NULL DEFAULT '{}',
  error text
);

CREATE INDEX idx_juno_live_lookup_run_started_at
  ON juno_live_lookup_run (started_at DESC);

CREATE TABLE juno_live_lookup_job (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  juno_id text NOT NULL,
  catalog_item_raw_id uuid REFERENCES catalog_item_raw(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (
    status IN ('queued', 'running', 'succeeded', 'failed', 'blocked', 'manual_required')
  ) DEFAULT 'queued',
  priority integer NOT NULL DEFAULT 0,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 2,
  not_before timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_juno_live_lookup_job_status_not_before
  ON juno_live_lookup_job (status, not_before, priority DESC, created_at);
CREATE INDEX idx_juno_live_lookup_job_juno_id
  ON juno_live_lookup_job (juno_id);
CREATE UNIQUE INDEX idx_juno_live_lookup_job_active_juno_id
  ON juno_live_lookup_job (juno_id)
  WHERE status IN ('queued', 'running');

CREATE TABLE juno_live_observation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES juno_live_lookup_job(id) ON DELETE SET NULL,
  run_id uuid REFERENCES juno_live_lookup_run(id) ON DELETE SET NULL,
  juno_id text NOT NULL,
  catalog_item_raw_id uuid REFERENCES catalog_item_raw(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (
    status IN ('in_stock', 'out_of_stock', 'preorder', 'coming_soon', 'unknown', 'failed', 'blocked')
  ),
  stock_quantity integer,
  stock_text text,
  display_stock text NOT NULL DEFAULT 'N/A',
  wholesale_price_gbp numeric(12, 2),
  product_url text NOT NULL,
  final_url text,
  parser_version text NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  duration_ms integer,
  error text,
  metadata jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_juno_live_observation_juno_observed
  ON juno_live_observation (juno_id, observed_at DESC);
CREATE INDEX idx_juno_live_observation_status
  ON juno_live_observation (status, observed_at DESC);

CREATE TABLE service_log_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id text,
  run_id uuid,
  job_id uuid,
  component text NOT NULL,
  level text NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
  event_name text NOT NULL,
  message text,
  context jsonb NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_service_log_event_correlation
  ON service_log_event (correlation_id, occurred_at DESC)
  WHERE correlation_id IS NOT NULL;
CREATE INDEX idx_service_log_event_run
  ON service_log_event (run_id, occurred_at DESC)
  WHERE run_id IS NOT NULL;
CREATE INDEX idx_service_log_event_job
  ON service_log_event (job_id, occurred_at DESC)
  WHERE job_id IS NOT NULL;
CREATE INDEX idx_service_log_event_component
  ON service_log_event (component, occurred_at DESC);

COMMIT;
