BEGIN;

UPDATE service_setting
SET auth_email_password_enabled = NULL,
    updated_at = now()
WHERE auth_email_password_enabled IS FALSE
  AND auth_external_provider_enabled IS DISTINCT FROM TRUE;

ALTER TABLE service_setting
  DROP CONSTRAINT IF EXISTS service_setting_auth_sign_in_method_check;

ALTER TABLE service_setting
  ADD CONSTRAINT service_setting_auth_sign_in_method_check
    CHECK (
      auth_email_password_enabled IS DISTINCT FROM FALSE
      OR auth_external_provider_enabled IS TRUE
    );

COMMIT;
