ALTER TABLE service_setting
  ADD COLUMN auth_login_logo_url text;

ALTER TABLE service_setting
  ADD CONSTRAINT service_setting_auth_login_logo_url_asset_check
    CHECK (
      auth_login_logo_url IS NULL
      OR auth_login_logo_url ~* '^https?://[^[:space:]]+\.(png|webp|svg)([?#].*)?$'
    );
