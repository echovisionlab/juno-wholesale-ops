BEGIN;

ALTER TABLE service_setting
  ADD COLUMN google_workspace_delegated_user text,
  ADD COLUMN google_service_account_key_json text,
  ADD COLUMN google_gmail_scopes text,
  ADD COLUMN gmail_ingest_query text,
  ADD COLUMN gmail_max_results integer CHECK (gmail_max_results > 0 AND gmail_max_results <= 500),
  ADD COLUMN gmail_processed_label text,
  ADD COLUMN gmail_storage_dir text,
  ADD COLUMN catalog_attachment_pattern text,
  ADD COLUMN supplier_code text;

COMMIT;
