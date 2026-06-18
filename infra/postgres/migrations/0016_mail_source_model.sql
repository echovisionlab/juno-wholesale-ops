BEGIN;

CREATE TABLE mail_connection (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  provider text NOT NULL CHECK (provider IN ('gmail', 'imap', 'microsoft_graph', 'generic')),
  auth_type text NOT NULL CHECK (auth_type IN ('google_workspace_delegation', 'basic', 'oauth2', 'api_token', 'none')),
  credential_type text NOT NULL CHECK (credential_type IN ('google_service_account_json', 'password', 'oauth_client_secret', 'api_token', 'none')),
  credential_secret text,
  credential_reference text,
  config jsonb NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mail_connection_secret_or_reference_check
    CHECK (
      credential_type = 'none'
      OR credential_secret IS NOT NULL
      OR credential_reference IS NOT NULL
    ),
  CONSTRAINT mail_connection_gmail_credential_check
    CHECK (
      provider <> 'gmail'
      OR (
        auth_type = 'google_workspace_delegation'
        AND credential_type = 'google_service_account_json'
      )
    )
);

CREATE INDEX idx_mail_connection_active_provider
  ON mail_connection (is_active, provider, created_at);

CREATE TABLE mail_mailbox_source (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES mail_connection(id) ON DELETE CASCADE,
  mailbox_address text NOT NULL,
  display_name text,
  provider_mailbox_id text,
  ingest_query text NOT NULL,
  max_results integer NOT NULL DEFAULT 25 CHECK (max_results > 0 AND max_results <= 500),
  ingest_lookback_ms integer NOT NULL DEFAULT 604800000 CHECK (ingest_lookback_ms > 0),
  processed_label text NOT NULL DEFAULT 'Wholesale Processed',
  storage_dir text NOT NULL DEFAULT '.data/mail-attachments',
  attachment_pattern text NOT NULL DEFAULT 'New Preorders|New Releases In Stock',
  supplier_code text NOT NULL DEFAULT 'juno',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, mailbox_address)
);

CREATE INDEX idx_mail_mailbox_source_active
  ON mail_mailbox_source (is_active, connection_id, created_at);

CREATE TABLE mail_mailbox_ingest_state (
  mailbox_source_id uuid PRIMARY KEY REFERENCES mail_mailbox_source(id) ON DELETE CASCADE,
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

ALTER TABLE mail_message
  ADD COLUMN provider text,
  ADD COLUMN mailbox_address text,
  ADD COLUMN mailbox_source_id uuid REFERENCES mail_mailbox_source(id) ON DELETE RESTRICT,
  ADD COLUMN provider_message_id text,
  ADD COLUMN provider_thread_id text;

UPDATE mail_message
SET provider = 'gmail',
    mailbox_address = gmail_user_email,
    provider_message_id = gmail_message_id,
    provider_thread_id = gmail_thread_id
WHERE provider IS NULL;

ALTER TABLE mail_message
  DROP CONSTRAINT IF EXISTS mail_message_gmail_user_email_gmail_message_id_key,
  ALTER COLUMN provider SET NOT NULL,
  ALTER COLUMN mailbox_address SET NOT NULL,
  ALTER COLUMN provider_message_id SET NOT NULL,
  ADD CONSTRAINT mail_message_provider_check
    CHECK (provider IN ('gmail', 'imap', 'microsoft_graph', 'generic')),
  ADD CONSTRAINT mail_message_mailbox_provider_message_unique
    UNIQUE (provider, mailbox_address, provider_message_id),
  DROP COLUMN gmail_user_email,
  DROP COLUMN gmail_message_id,
  DROP COLUMN gmail_thread_id;

DROP TABLE gmail_ingest_state;

ALTER TABLE service_setting
  DROP COLUMN gmail_ingest_lookback_ms,
  DROP COLUMN google_workspace_delegated_user,
  DROP COLUMN google_service_account_key_json,
  DROP COLUMN google_gmail_scopes,
  DROP COLUMN gmail_ingest_query,
  DROP COLUMN gmail_max_results,
  DROP COLUMN gmail_processed_label,
  DROP COLUMN gmail_storage_dir,
  DROP COLUMN catalog_attachment_pattern,
  DROP COLUMN supplier_code;

COMMIT;
