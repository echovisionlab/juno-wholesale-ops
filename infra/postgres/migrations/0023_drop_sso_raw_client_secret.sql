BEGIN;

ALTER TABLE auth_sso_provider
  DROP COLUMN IF EXISTS client_secret;

COMMIT;
