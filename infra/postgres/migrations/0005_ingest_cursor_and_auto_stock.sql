BEGIN;

ALTER TABLE service_setting
  ADD COLUMN gmail_ingest_lookback_ms integer CHECK (gmail_ingest_lookback_ms > 0),
  ADD COLUMN juno_live_auto_enqueue_on_interval boolean,
  ADD COLUMN juno_live_auto_enqueue_limit integer CHECK (juno_live_auto_enqueue_limit > 0);

CREATE TABLE gmail_ingest_state (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  last_query text,
  last_query_window_from timestamptz,
  last_query_window_to timestamptz,
  last_query_started_at timestamptz,
  last_query_finished_at timestamptz,
  last_query_status text CHECK (last_query_status IN ('running', 'succeeded', 'failed')),
  last_query_error text,
  last_query_message_count integer NOT NULL DEFAULT 0 CHECK (last_query_message_count >= 0),
  last_query_attachment_count integer NOT NULL DEFAULT 0 CHECK (last_query_attachment_count >= 0),
  last_successful_message_received_at timestamptz,
  last_ingested_snapshot_id uuid REFERENCES catalog_snapshot(id) ON DELETE SET NULL,
  last_ingested_catalog_date date,
  last_ingested_content_hash text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO gmail_ingest_state (id)
VALUES (true)
ON CONFLICT (id) DO NOTHING;

COMMIT;
