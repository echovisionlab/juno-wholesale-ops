BEGIN;

ALTER TABLE service_setting
  ADD COLUMN auth_email_password_login_enabled boolean NOT NULL DEFAULT true;

CREATE TABLE auth_sso_provider (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id text NOT NULL UNIQUE,
  display_name text NOT NULL,
  button_label text,
  logo_url text,
  discovery_url text,
  client_id text,
  client_secret text,
  scopes text NOT NULL DEFAULT 'openid email profile',
  enabled boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_sso_provider_id_format_check
    CHECK (provider_id ~ '^[a-z0-9][a-z0-9_-]{1,62}$')
);

CREATE TABLE auth_sso_admin_rule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES auth_sso_provider(id) ON DELETE CASCADE,
  rule_type text NOT NULL,
  rule_value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_sso_admin_rule_type_check
    CHECK (rule_type IN ('email_allowlist', 'claim_equals')),
  CONSTRAINT auth_sso_admin_rule_unique
    UNIQUE (provider_id, rule_type, rule_value)
);

WITH legacy_provider AS (
  SELECT
    COALESCE(NULLIF(trim(auth_external_provider_id), ''), 'legacy-sso') AS provider_id,
    COALESCE(NULLIF(trim(auth_external_provider_name), ''), NULLIF(trim(auth_external_provider_id), ''), 'Legacy SSO') AS display_name,
    NULLIF(trim(auth_external_provider_button_label), '') AS button_label,
    NULLIF(trim(auth_external_provider_logo_url), '') AS logo_url,
    NULLIF(trim(auth_external_discovery_url), '') AS discovery_url,
    NULLIF(trim(auth_external_client_id), '') AS client_id,
    auth_external_client_secret AS client_secret,
    COALESCE(NULLIF(trim(auth_external_provider_scopes), ''), 'openid email profile') AS scopes,
    COALESCE(auth_external_provider_enabled, false) AS enabled
  FROM service_setting
  WHERE id = true
    AND (
      auth_external_provider_enabled IS NOT NULL
      OR auth_external_provider_id IS NOT NULL
      OR auth_external_provider_name IS NOT NULL
      OR auth_external_discovery_url IS NOT NULL
      OR auth_external_client_id IS NOT NULL
      OR auth_external_client_secret IS NOT NULL
    )
),
inserted AS (
  INSERT INTO auth_sso_provider (
    provider_id,
    display_name,
    button_label,
    logo_url,
    discovery_url,
    client_id,
    client_secret,
    scopes,
    enabled
  )
  SELECT
    provider_id,
    display_name,
    button_label,
    logo_url,
    discovery_url,
    client_id,
    client_secret,
    scopes,
    enabled
  FROM legacy_provider
  ON CONFLICT (provider_id) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        button_label = EXCLUDED.button_label,
        logo_url = EXCLUDED.logo_url,
        discovery_url = EXCLUDED.discovery_url,
        client_id = EXCLUDED.client_id,
        client_secret = EXCLUDED.client_secret,
        scopes = EXCLUDED.scopes,
        enabled = EXCLUDED.enabled,
        updated_at = now()
  RETURNING id
)
INSERT INTO auth_sso_admin_rule (provider_id, rule_type, rule_value)
SELECT inserted.id, 'email_allowlist', trim(value)
FROM inserted
CROSS JOIN service_setting
CROSS JOIN regexp_split_to_table(COALESCE(service_setting.auth_admin_email_allowlist, ''), '[,\n]+') AS value
WHERE service_setting.id = true
  AND trim(value) <> ''
ON CONFLICT (provider_id, rule_type, rule_value) DO NOTHING;

INSERT INTO auth_sso_admin_rule (provider_id, rule_type, rule_value)
SELECT auth_sso_provider.id,
       'claim_equals',
       concat(trim(service_setting.auth_external_admin_claim), '=', trim(service_setting.auth_external_admin_claim_value))
FROM auth_sso_provider
CROSS JOIN service_setting
WHERE service_setting.id = true
  AND COALESCE(NULLIF(trim(service_setting.auth_external_provider_id), ''), 'legacy-sso') = auth_sso_provider.provider_id
  AND trim(COALESCE(service_setting.auth_external_admin_claim, '')) <> ''
  AND trim(COALESCE(service_setting.auth_external_admin_claim_value, '')) <> ''
ON CONFLICT (provider_id, rule_type, rule_value) DO NOTHING;

ALTER TABLE service_setting
  DROP COLUMN IF EXISTS auth_external_provider_enabled,
  DROP COLUMN IF EXISTS auth_external_provider_id,
  DROP COLUMN IF EXISTS auth_external_provider_name,
  DROP COLUMN IF EXISTS auth_external_provider_logo_url,
  DROP COLUMN IF EXISTS auth_external_provider_button_label,
  DROP COLUMN IF EXISTS auth_external_discovery_url,
  DROP COLUMN IF EXISTS auth_external_client_id,
  DROP COLUMN IF EXISTS auth_external_client_secret,
  DROP COLUMN IF EXISTS auth_external_provider_scopes,
  DROP COLUMN IF EXISTS auth_admin_email_allowlist,
  DROP COLUMN IF EXISTS auth_external_admin_claim,
  DROP COLUMN IF EXISTS auth_external_admin_claim_value;

COMMIT;
