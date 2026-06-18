ALTER TABLE service_setting
  ADD COLUMN data_mode text,
  ADD COLUMN auth_external_provider_logo_url text,
  ADD COLUMN auth_external_provider_button_label text,
  ADD COLUMN auth_external_provider_scopes text,
  ADD COLUMN auth_admin_email_allowlist text,
  ADD COLUMN auth_external_admin_claim text,
  ADD COLUMN auth_external_admin_claim_value text,
  ADD CONSTRAINT service_setting_data_mode_check
    CHECK (data_mode IS NULL OR data_mode IN ('demo', 'real_mailbox'));
