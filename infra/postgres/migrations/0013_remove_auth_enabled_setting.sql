ALTER TABLE service_setting
  DROP CONSTRAINT IF EXISTS service_setting_auth_sign_in_method_check;

ALTER TABLE service_setting
  ADD COLUMN auth_secret text;

ALTER TABLE service_setting
  DROP COLUMN IF EXISTS auth_enabled;

ALTER TABLE service_setting
  ADD CONSTRAINT service_setting_auth_sign_in_method_check
    CHECK (
      auth_email_password_enabled IS DISTINCT FROM false
      OR auth_external_provider_enabled IS DISTINCT FROM false
    );

ALTER TABLE service_setting
  ADD CONSTRAINT service_setting_auth_secret_length_check
    CHECK (auth_secret IS NULL OR length(auth_secret) >= 32);
