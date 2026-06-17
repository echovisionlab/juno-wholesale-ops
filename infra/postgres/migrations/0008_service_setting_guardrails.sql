ALTER TABLE service_setting
  ADD CONSTRAINT service_setting_juno_live_delay_range_check
    CHECK (
      juno_live_delay_min_ms IS NULL
      OR juno_live_delay_max_ms IS NULL
      OR juno_live_delay_min_ms <= juno_live_delay_max_ms
    ),
  ADD CONSTRAINT service_setting_auth_sign_in_method_check
    CHECK (
      auth_enabled IS DISTINCT FROM TRUE
      OR auth_email_password_enabled IS DISTINCT FROM FALSE
      OR auth_external_provider_enabled IS DISTINCT FROM FALSE
    );
