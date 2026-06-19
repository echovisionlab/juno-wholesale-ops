BEGIN;

ALTER TABLE service_setting
  DROP CONSTRAINT IF EXISTS service_setting_data_mode_check,
  DROP COLUMN IF EXISTS data_mode;

ALTER TABLE auth_sso_provider
  ADD COLUMN IF NOT EXISTS protocol text NOT NULL DEFAULT 'oidc',
  ADD COLUMN IF NOT EXISTS preset text NOT NULL DEFAULT 'custom_oidc',
  ADD COLUMN IF NOT EXISTS authorization_url text,
  ADD COLUMN IF NOT EXISTS token_url text,
  ADD COLUMN IF NOT EXISTS user_info_url text;

ALTER TABLE auth_sso_provider
  DROP CONSTRAINT IF EXISTS auth_sso_provider_protocol_check,
  ADD CONSTRAINT auth_sso_provider_protocol_check
    CHECK (protocol IN ('oidc', 'oauth2')),
  DROP CONSTRAINT IF EXISTS auth_sso_provider_preset_check,
  ADD CONSTRAINT auth_sso_provider_preset_check
    CHECK (preset IN (
      'custom_oidc',
      'custom_oauth2',
      'google_oidc',
      'microsoft_entra_oidc',
      'auth0_oidc',
      'okta_oidc'
    )),
  DROP CONSTRAINT IF EXISTS auth_sso_provider_preset_protocol_check,
  ADD CONSTRAINT auth_sso_provider_preset_protocol_check
    CHECK (
      (protocol = 'oidc' AND preset IN (
        'custom_oidc',
        'google_oidc',
        'microsoft_entra_oidc',
        'auth0_oidc',
        'okta_oidc'
      ))
      OR (protocol = 'oauth2' AND preset = 'custom_oauth2')
    );

COMMIT;
