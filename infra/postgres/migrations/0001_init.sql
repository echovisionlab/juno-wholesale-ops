BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE supplier (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE mail_message (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_user_email text NOT NULL,
  gmail_message_id text NOT NULL,
  gmail_thread_id text,
  rfc822_message_id text,
  subject text,
  from_address text,
  to_addresses text[] NOT NULL DEFAULT '{}',
  delivered_to text[] NOT NULL DEFAULT '{}',
  received_at timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL,
  UNIQUE (gmail_user_email, gmail_message_id)
);

CREATE INDEX idx_mail_message_rfc822 ON mail_message (rfc822_message_id)
  WHERE rfc822_message_id IS NOT NULL;
CREATE INDEX idx_mail_message_received_at ON mail_message (received_at DESC);

CREATE TABLE mail_attachment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES mail_message(id) ON DELETE CASCADE,
  filename text NOT NULL,
  mime_type text NOT NULL,
  byte_size integer NOT NULL,
  sha256 text NOT NULL,
  storage_uri text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, sha256)
);

CREATE INDEX idx_mail_attachment_sha256 ON mail_attachment (sha256);

CREATE TABLE catalog_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES supplier(id),
  catalog_kind text NOT NULL CHECK (catalog_kind IN ('preorder', 'in_stock', 'unknown')),
  catalog_date date,
  source_filename text NOT NULL,
  source_attachment_id uuid NOT NULL REFERENCES mail_attachment(id),
  content_hash text NOT NULL,
  row_count integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_id, catalog_kind, catalog_date, content_hash)
);

CREATE INDEX idx_catalog_snapshot_created_at ON catalog_snapshot (created_at DESC);
CREATE INDEX idx_catalog_snapshot_kind_date ON catalog_snapshot (catalog_kind, catalog_date DESC);

CREATE TABLE catalog_item_raw (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL REFERENCES catalog_snapshot(id) ON DELETE CASCADE,
  row_number integer NOT NULL,
  juno_id text,
  barcode text,
  artist text,
  title text,
  label text,
  cat_no text,
  medium text,
  description text,
  genre text,
  dealer_ex_vat_text text,
  dealer_price_gbp numeric(12, 2),
  stock integer,
  release_date date,
  max_order integer,
  raw jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (snapshot_id, row_number)
);

CREATE INDEX idx_catalog_item_raw_juno_id ON catalog_item_raw (juno_id)
  WHERE juno_id IS NOT NULL;
CREATE INDEX idx_catalog_item_raw_barcode ON catalog_item_raw (barcode)
  WHERE barcode IS NOT NULL;
CREATE INDEX idx_catalog_item_raw_genre ON catalog_item_raw (genre)
  WHERE genre IS NOT NULL;

CREATE TABLE processing_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type text NOT NULL,
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  summary jsonb NOT NULL DEFAULT '{}',
  error text
);

COMMIT;
