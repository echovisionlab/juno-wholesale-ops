BEGIN;

CREATE TABLE service_setting (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  juno_live_enqueue_on_ingest boolean,
  juno_login_email text,
  juno_login_password text,
  juno_browser_profile_dir text,
  juno_browser_headless boolean,
  juno_live_concurrency integer CHECK (juno_live_concurrency BETWEEN 1 AND 10),
  juno_live_delay_min_ms integer CHECK (juno_live_delay_min_ms >= 0),
  juno_live_delay_max_ms integer CHECK (juno_live_delay_max_ms >= 0),
  juno_live_nav_timeout_ms integer CHECK (juno_live_nav_timeout_ms > 0),
  juno_live_max_attempts integer CHECK (juno_live_max_attempts > 0),
  juno_live_poll_interval_ms integer CHECK (juno_live_poll_interval_ms > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO service_setting (id)
VALUES (true)
ON CONFLICT (id) DO NOTHING;

COMMIT;
