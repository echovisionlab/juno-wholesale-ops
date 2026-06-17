BEGIN;

ALTER TABLE signal_event
  DROP CONSTRAINT signal_event_type_check;

ALTER TABLE signal_event
  ADD CONSTRAINT signal_event_type_check
  CHECK (
    type IN (
      'new_arrival',
      'watch_hit',
      'low_catalog_stock',
      'exclude_match',
      'observed_restock',
      'observed_stock_drop',
      'observed_live_low_stock',
      'observed_status_change',
      'observed_price_change',
      'fast_mover_candidate',
      'trend_spike'
    )
  );

ALTER TABLE signal_event
  ALTER COLUMN identity_id DROP NOT NULL,
  ADD COLUMN event_key text;

CREATE UNIQUE INDEX idx_signal_event_event_key
  ON signal_event (event_key)
  WHERE event_key IS NOT NULL;

ALTER TABLE juno_live_observation
  ADD COLUMN identity_id uuid REFERENCES catalog_item_identity(id) ON DELETE SET NULL;

CREATE INDEX idx_juno_live_observation_identity_observed_at
  ON juno_live_observation (identity_id, observed_at DESC)
  WHERE identity_id IS NOT NULL;

UPDATE juno_live_observation
SET identity_id = catalog_item_raw.identity_id
FROM catalog_item_raw
WHERE juno_live_observation.catalog_item_raw_id = catalog_item_raw.id
  AND catalog_item_raw.identity_id IS NOT NULL;

UPDATE juno_live_observation
SET identity_id = catalog_item_identity.id
FROM catalog_item_identity
WHERE juno_live_observation.identity_id IS NULL
  AND juno_live_observation.juno_id IS NOT NULL
  AND catalog_item_identity.juno_id = trim(regexp_replace(lower(juno_live_observation.juno_id), '[^a-z0-9]+', ' ', 'g'));

COMMIT;
