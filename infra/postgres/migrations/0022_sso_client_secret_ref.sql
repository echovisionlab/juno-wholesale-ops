BEGIN;

ALTER TABLE auth_sso_provider
  ADD COLUMN client_secret_ref text,
  ADD CONSTRAINT auth_sso_provider_client_secret_ref_not_blank_check
    CHECK (client_secret_ref IS NULL OR btrim(client_secret_ref) <> '');

COMMIT;
