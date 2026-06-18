BEGIN;

ALTER TABLE service_setting
  DROP CONSTRAINT IF EXISTS service_setting_auth_sign_in_method_check;

ALTER TABLE service_setting
  DROP COLUMN IF EXISTS auth_email_password_enabled;

COMMIT;
