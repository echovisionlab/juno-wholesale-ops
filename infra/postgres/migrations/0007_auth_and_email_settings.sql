BEGIN;

CREATE TABLE auth_user (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  email_verified boolean NOT NULL DEFAULT false,
  image text,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auth_session (
  id text PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text,
  user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE
);

CREATE INDEX idx_auth_session_user_id ON auth_session (user_id);

CREATE TABLE auth_account (
  id text PRIMARY KEY,
  account_id text NOT NULL,
  provider_id text NOT NULL,
  user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  password text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, account_id)
);

CREATE INDEX idx_auth_account_user_id ON auth_account (user_id);

CREATE TABLE auth_verification (
  id text PRIMARY KEY,
  identifier text NOT NULL,
  value text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_auth_verification_identifier ON auth_verification (identifier);

ALTER TABLE service_setting
  ADD COLUMN auth_enabled boolean,
  ADD COLUMN auth_base_url text,
  ADD COLUMN auth_trusted_origins text,
  ADD COLUMN auth_email_password_enabled boolean,
  ADD COLUMN auth_external_provider_enabled boolean,
  ADD COLUMN auth_external_provider_id text,
  ADD COLUMN auth_external_provider_name text,
  ADD COLUMN auth_external_discovery_url text,
  ADD COLUMN auth_external_client_id text,
  ADD COLUMN auth_external_client_secret text;

CREATE TABLE email_adapter (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('logging', 'smtp')),
  is_active boolean NOT NULL DEFAULT false,
  priority integer NOT NULL DEFAULT 0,
  config jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_adapter_active_priority
  ON email_adapter (is_active, priority, created_at);

COMMIT;
