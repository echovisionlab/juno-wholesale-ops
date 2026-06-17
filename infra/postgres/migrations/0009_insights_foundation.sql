BEGIN;

CREATE TABLE catalog_item_identity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  identity_key text NOT NULL,
  juno_id text,
  barcode text,
  artist_norm text,
  title_norm text,
  label_norm text,
  cat_no_norm text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_id, identity_key)
);

CREATE INDEX idx_catalog_item_identity_juno_id
  ON catalog_item_identity (juno_id)
  WHERE juno_id IS NOT NULL;
CREATE INDEX idx_catalog_item_identity_barcode
  ON catalog_item_identity (barcode)
  WHERE barcode IS NOT NULL;

ALTER TABLE catalog_item_raw
  ADD COLUMN identity_id uuid REFERENCES catalog_item_identity(id) ON DELETE SET NULL;

CREATE INDEX idx_catalog_item_raw_identity_id
  ON catalog_item_raw (identity_id)
  WHERE identity_id IS NOT NULL;

CREATE TABLE watch_rule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('artist', 'label', 'genre', 'keyword', 'exclude_keyword')),
  pattern text NOT NULL,
  pattern_norm text NOT NULL CHECK (length(pattern_norm) > 0),
  weight integer NOT NULL DEFAULT 10 CHECK (weight BETWEEN -100 AND 100),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (type, pattern_norm)
);

CREATE INDEX idx_watch_rule_enabled_type
  ON watch_rule (enabled, type, pattern_norm);

CREATE TABLE watch_match (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  watch_rule_id uuid NOT NULL REFERENCES watch_rule(id) ON DELETE CASCADE,
  identity_id uuid NOT NULL REFERENCES catalog_item_identity(id) ON DELETE CASCADE,
  catalog_item_raw_id uuid REFERENCES catalog_item_raw(id) ON DELETE CASCADE,
  matched_field text NOT NULL,
  score integer NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_watch_match_rule_item_field
  ON watch_match (watch_rule_id, catalog_item_raw_id, matched_field)
  WHERE catalog_item_raw_id IS NOT NULL;
CREATE INDEX idx_watch_match_identity
  ON watch_match (identity_id, created_at DESC);

CREATE TABLE signal_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id uuid NOT NULL REFERENCES catalog_item_identity(id) ON DELETE CASCADE,
  catalog_item_raw_id uuid REFERENCES catalog_item_raw(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('new_arrival', 'watch_hit', 'low_catalog_stock', 'exclude_match')),
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'watch', 'warning', 'critical')),
  score integer NOT NULL DEFAULT 0,
  title text NOT NULL,
  detail text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_signal_event_type_item
  ON signal_event (type, catalog_item_raw_id)
  WHERE catalog_item_raw_id IS NOT NULL;
CREATE INDEX idx_signal_event_created_at
  ON signal_event (created_at DESC);
CREATE INDEX idx_signal_event_identity
  ON signal_event (identity_id, created_at DESC);

COMMIT;
