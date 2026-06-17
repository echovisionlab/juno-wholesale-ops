BEGIN;

CREATE TABLE notification_channel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('in_app', 'webhook', 'logging')),
  enabled boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}',
  secret_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name)
);

CREATE INDEX idx_notification_channel_enabled_type
  ON notification_channel (enabled, type);

CREATE TABLE notification_rule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  channel_id uuid NOT NULL REFERENCES notification_channel(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  signal_types text[] NOT NULL DEFAULT '{}',
  severities text[] NOT NULL DEFAULT '{}',
  min_score integer NOT NULL DEFAULT 0 CHECK (min_score BETWEEN -100 AND 100),
  include_watch_hits boolean NOT NULL DEFAULT true,
  include_digest boolean NOT NULL DEFAULT false,
  cooldown_minutes integer NOT NULL DEFAULT 60 CHECK (cooldown_minutes >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, channel_id)
);

CREATE INDEX idx_notification_rule_channel_enabled
  ON notification_rule (channel_id, enabled);

CREATE TABLE notification_delivery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid REFERENCES notification_rule(id) ON DELETE SET NULL,
  channel_id uuid REFERENCES notification_channel(id) ON DELETE SET NULL,
  signal_event_id uuid REFERENCES signal_event(id) ON DELETE CASCADE,
  digest_key text,
  status text NOT NULL CHECK (status IN ('queued', 'sent', 'failed', 'skipped')),
  delivery_key text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  queued_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (delivery_key)
);

CREATE INDEX idx_notification_delivery_status_queued
  ON notification_delivery (status, queued_at);
CREATE INDEX idx_notification_delivery_signal_event
  ON notification_delivery (signal_event_id)
  WHERE signal_event_id IS NOT NULL;
CREATE INDEX idx_notification_delivery_digest_key
  ON notification_delivery (digest_key)
  WHERE digest_key IS NOT NULL;
CREATE INDEX idx_notification_delivery_rule_channel
  ON notification_delivery (rule_id, channel_id, queued_at DESC);

INSERT INTO notification_channel (name, type, enabled, config)
VALUES ('In-app notifications', 'in_app', true, '{}')
ON CONFLICT (name) DO NOTHING;

COMMIT;
