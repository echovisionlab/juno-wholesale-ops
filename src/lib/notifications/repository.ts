import { Pool, type PoolClient } from "pg";
import type { SignalEventType, SignalSeverity } from "@/lib/insights/repository";
import { getInsightDigest } from "@/lib/insights/trend-repository";
import {
  buildDigestDeliveryKey,
  buildSignalDeliveryKey,
  notificationRuleMatchesSignal,
  shouldSkipForCooldown,
  type CooldownDelivery,
} from "./matcher";
import { normalizeNotificationWebhookFormat } from "./provider-formatters";
import {
  maskNotificationChannelConfig,
  renderDigestNotification,
  renderSignalNotification,
  summarizeNotificationChannelConfig,
} from "./render";
import {
  notificationChannelTypes,
  notificationSignalSeverities,
  notificationSignalTypes,
  type NotificationChannel,
  type NotificationChannelInput,
  type NotificationChannelPatch,
  type NotificationChannelType,
  type NotificationConfig,
  type NotificationDelivery,
  type NotificationDeliveryStatus,
  type NotificationQueueResult,
  type NotificationRule,
  type NotificationRuleInput,
  type NotificationRulePatch,
  type NotificationSignal,
} from "./types";

export async function listNotificationChannels(databaseUrl: string): Promise<NotificationChannel[]> {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    return await listNotificationChannelsClient(pool);
  } finally {
    await pool.end();
  }
}

export async function createNotificationChannel(
  databaseUrl: string,
  input: NotificationChannelInput,
): Promise<NotificationChannel> {
  const normalized = normalizeNotificationChannelInput(input);
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    const result = await pool.query<NotificationChannelRow>(
      `
        INSERT INTO notification_channel (name, type, enabled, config, secret_ref)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (name) DO UPDATE SET
          type = EXCLUDED.type,
          enabled = EXCLUDED.enabled,
          config = EXCLUDED.config,
          secret_ref = EXCLUDED.secret_ref,
          updated_at = now()
        RETURNING ${notificationChannelSelectColumns}
      `,
      [
        normalized.name,
        normalized.type,
        normalized.enabled,
        JSON.stringify(normalized.config),
        normalized.secretRef,
      ],
    );
    return mapNotificationChannelRow(result.rows[0]);
  } finally {
    await pool.end();
  }
}

export async function updateNotificationChannel(
  databaseUrl: string,
  patch: NotificationChannelPatch,
): Promise<NotificationChannel | null> {
  if (!patch.id) {
    throw new Error("Notification channel id is required");
  }
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    const current = await pool.query<NotificationChannelRow>(
      `
        SELECT ${notificationChannelSelectColumns}
        FROM notification_channel
        WHERE id = $1
      `,
      [patch.id],
    );
    if (!current.rows[0]) {
      return null;
    }
    const merged = normalizeNotificationChannelInput({
      name: patch.name ?? current.rows[0].name,
      type: patch.type ?? current.rows[0].type,
      enabled: patch.enabled ?? current.rows[0].enabled,
      config: "config" in patch ? mergeNotificationConfig(current.rows[0].config, patch.config) : current.rows[0].config,
      secretRef: "secretRef" in patch ? patch.secretRef ?? null : current.rows[0].secret_ref,
    });
    const updated = await pool.query<NotificationChannelRow>(
      `
        UPDATE notification_channel
        SET name = $2,
            type = $3,
            enabled = $4,
            config = $5,
            secret_ref = $6,
            updated_at = now()
        WHERE id = $1
        RETURNING ${notificationChannelSelectColumns}
      `,
      [
        patch.id,
        merged.name,
        merged.type,
        merged.enabled,
        JSON.stringify(merged.config),
        merged.secretRef,
      ],
    );
    return mapNotificationChannelRow(updated.rows[0]);
  } finally {
    await pool.end();
  }
}

export async function deleteNotificationChannel(databaseUrl: string, id: string): Promise<boolean> {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    const result = await pool.query("DELETE FROM notification_channel WHERE id = $1", [id]);
    return Number(result.rowCount) > 0;
  } finally {
    await pool.end();
  }
}

export async function listNotificationRules(databaseUrl: string): Promise<NotificationRule[]> {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    return await listNotificationRulesClient(pool);
  } finally {
    await pool.end();
  }
}

export async function createNotificationRule(
  databaseUrl: string,
  input: NotificationRuleInput,
): Promise<NotificationRule> {
  const normalized = normalizeNotificationRuleInput(input);
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    const result = await pool.query<NotificationRuleRow>(
      `
        WITH upserted AS (
          INSERT INTO notification_rule (
            name,
            channel_id,
            enabled,
            signal_types,
            severities,
            min_score,
            include_watch_hits,
            include_digest,
            cooldown_minutes
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          ON CONFLICT (name, channel_id) DO UPDATE SET
            enabled = EXCLUDED.enabled,
            signal_types = EXCLUDED.signal_types,
            severities = EXCLUDED.severities,
            min_score = EXCLUDED.min_score,
            include_watch_hits = EXCLUDED.include_watch_hits,
            include_digest = EXCLUDED.include_digest,
            cooldown_minutes = EXCLUDED.cooldown_minutes,
            updated_at = now()
          RETURNING
            id::text,
            name,
            channel_id::text,
            enabled,
            signal_types,
            severities,
            min_score,
            include_watch_hits,
            include_digest,
            cooldown_minutes,
            created_at::text,
            updated_at::text
        )
        SELECT
          upserted.id,
          upserted.name,
          upserted.channel_id,
          notification_channel.name AS channel_name,
          notification_channel.type AS channel_type,
          notification_channel.enabled AS channel_enabled,
          upserted.enabled,
          upserted.signal_types,
          upserted.severities,
          upserted.min_score,
          upserted.include_watch_hits,
          upserted.include_digest,
          upserted.cooldown_minutes,
          upserted.created_at,
          upserted.updated_at
        FROM upserted
        JOIN notification_channel ON notification_channel.id = upserted.channel_id::uuid
      `,
      ruleParams(normalized),
    );
    return mapNotificationRuleRow(result.rows[0]);
  } finally {
    await pool.end();
  }
}

export async function updateNotificationRule(
  databaseUrl: string,
  patch: NotificationRulePatch,
): Promise<NotificationRule | null> {
  if (!patch.id) {
    throw new Error("Notification rule id is required");
  }
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    const current = await pool.query<NotificationRuleRow>(
      `
        SELECT ${notificationRuleSelectColumns}
        FROM notification_rule
        JOIN notification_channel ON notification_channel.id = notification_rule.channel_id
        WHERE notification_rule.id = $1
      `,
      [patch.id],
    );
    if (!current.rows[0]) {
      return null;
    }
    const merged = normalizeNotificationRuleInput({
      name: patch.name ?? current.rows[0].name,
      channelId: patch.channelId ?? current.rows[0].channel_id,
      enabled: patch.enabled ?? current.rows[0].enabled,
      signalTypes: patch.signalTypes ?? current.rows[0].signal_types,
      severities: patch.severities ?? current.rows[0].severities,
      minScore: patch.minScore ?? current.rows[0].min_score,
      includeWatchHits: patch.includeWatchHits ?? current.rows[0].include_watch_hits,
      includeDigest: patch.includeDigest ?? current.rows[0].include_digest,
      cooldownMinutes: patch.cooldownMinutes ?? current.rows[0].cooldown_minutes,
    });
    const updated = await pool.query<NotificationRuleRow>(
      `
        WITH updated AS (
          UPDATE notification_rule
          SET name = $2,
              channel_id = $3,
              enabled = $4,
              signal_types = $5,
              severities = $6,
              min_score = $7,
              include_watch_hits = $8,
              include_digest = $9,
              cooldown_minutes = $10,
              updated_at = now()
          WHERE id = $1
          RETURNING
            id::text,
            name,
            channel_id::text,
            enabled,
            signal_types,
            severities,
            min_score,
            include_watch_hits,
            include_digest,
            cooldown_minutes,
            created_at::text,
            updated_at::text
        )
        SELECT
          updated.id,
          updated.name,
          updated.channel_id,
          notification_channel.name AS channel_name,
          notification_channel.type AS channel_type,
          notification_channel.enabled AS channel_enabled,
          updated.enabled,
          updated.signal_types,
          updated.severities,
          updated.min_score,
          updated.include_watch_hits,
          updated.include_digest,
          updated.cooldown_minutes,
          updated.created_at,
          updated.updated_at
        FROM updated
        JOIN notification_channel ON notification_channel.id = updated.channel_id::uuid
      `,
      [patch.id, ...ruleParams(merged)],
    );
    return mapNotificationRuleRow(updated.rows[0]);
  } finally {
    await pool.end();
  }
}

export async function deleteNotificationRule(databaseUrl: string, id: string): Promise<boolean> {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    const result = await pool.query("DELETE FROM notification_rule WHERE id = $1", [id]);
    return Number(result.rowCount) > 0;
  } finally {
    await pool.end();
  }
}

export async function listNotificationDeliveries(databaseUrl: string, limit: number): Promise<NotificationDelivery[]> {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    const result = await pool.query<NotificationDeliveryRow>(
      `
        SELECT
          notification_delivery.id::text,
          notification_delivery.rule_id::text,
          notification_rule.name AS rule_name,
          notification_delivery.channel_id::text,
          notification_channel.name AS channel_name,
          notification_channel.type AS channel_type,
          notification_delivery.signal_event_id::text,
          notification_delivery.digest_key,
          notification_delivery.status,
          notification_delivery.delivery_key,
          notification_delivery.subject,
          notification_delivery.body,
          notification_delivery.payload,
          notification_delivery.attempts,
          notification_delivery.last_error,
          notification_delivery.queued_at::text,
          notification_delivery.sent_at::text,
          notification_delivery.updated_at::text,
          signal_event.type AS signal_type,
          signal_event.severity,
          signal_event.score
        FROM notification_delivery
        LEFT JOIN notification_rule ON notification_rule.id = notification_delivery.rule_id
        LEFT JOIN notification_channel ON notification_channel.id = notification_delivery.channel_id
        LEFT JOIN signal_event ON signal_event.id = notification_delivery.signal_event_id
        ORDER BY notification_delivery.queued_at DESC, notification_delivery.id DESC
        LIMIT $1
      `,
      [limit],
    );
    return result.rows.map(mapNotificationDeliveryRow);
  } finally {
    await pool.end();
  }
}

export async function matchNotificationRulesForSignals(options: {
  databaseUrl: string;
  since?: string;
  limit?: number;
  digestDate?: string;
}): Promise<NotificationQueueResult> {
  const signalResult = await queueSignalNotifications(options);
  const digestResult = await queueDigestNotifications({
    databaseUrl: options.databaseUrl,
    digestDate: options.digestDate ?? toUtcDateKey(new Date()),
  });
  return {
    queued: signalResult.queued + digestResult.queued,
    skipped: signalResult.skipped + digestResult.skipped,
  };
}

async function queueSignalNotifications(options: {
  databaseUrl: string;
  since?: string;
  limit?: number;
}): Promise<NotificationQueueResult> {
  const pool = new Pool({ connectionString: options.databaseUrl, max: 4 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const rules = await listActiveNotificationRulesClient(client);
    const signals = await loadNotificationSignals(client, options.since ?? defaultSince(), options.limit ?? 500);
    const cooldownDeliveries = await loadCooldownDeliveries(client, maxCooldownMinutes(rules));
    const now = new Date();
    const result: NotificationQueueResult = { queued: 0, skipped: 0 };

    for (const rule of rules) {
      for (const signal of signals) {
        if (!notificationRuleMatchesSignal(rule, signal)) {
          continue;
        }
        const deliveryKey = buildSignalDeliveryKey({
          ruleId: rule.id,
          channelId: rule.channelId,
          signalEventId: signal.signalId,
        });
        if (shouldSkipForCooldown({ rule, signal, deliveries: cooldownDeliveries, now })) {
          result.skipped += 1;
          continue;
        }
        const rendered = renderSignalNotification(signal);
        const inserted = await insertNotificationDelivery(client, {
          ruleId: rule.id,
          channelId: rule.channelId,
          signalEventId: signal.signalId,
          digestKey: null,
          deliveryKey,
          subject: rendered.subject,
          body: rendered.body,
          payload: rendered.payload,
        });
        if (inserted) {
          result.queued += 1;
          cooldownDeliveries.push({
            ruleId: rule.id,
            identityId: signal.item.identityId,
            signalType: signal.type,
            queuedAt: now.toISOString(),
            status: "queued",
          });
        } else {
          result.skipped += 1;
        }
      }
    }
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function queueDigestNotifications(options: {
  databaseUrl: string;
  digestDate: string;
}): Promise<NotificationQueueResult> {
  const digest = await getInsightDigest(options.databaseUrl);
  const pool = new Pool({ connectionString: options.databaseUrl, max: 2 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const rules = (await listActiveNotificationRulesClient(client)).filter((rule) => rule.includeDigest);
    const result: NotificationQueueResult = { queued: 0, skipped: 0 };
    for (const rule of rules) {
      const deliveryKey = buildDigestDeliveryKey({
        ruleId: rule.id,
        channelId: rule.channelId,
        digestDate: options.digestDate,
      });
      const rendered = renderDigestNotification({ digest, digestDate: options.digestDate });
      const inserted = await insertNotificationDelivery(client, {
        ruleId: rule.id,
        channelId: rule.channelId,
        signalEventId: null,
        digestKey: options.digestDate,
        deliveryKey,
        subject: rendered.subject,
        body: rendered.body,
        payload: rendered.payload,
      });
      if (inserted) {
        result.queued += 1;
      } else {
        result.skipped += 1;
      }
    }
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function insertNotificationDelivery(
  client: PoolClient,
  input: {
    ruleId: string;
    channelId: string;
    signalEventId: string | null;
    digestKey: string | null;
    deliveryKey: string;
    subject: string;
    body: string;
    payload: NotificationConfig;
  },
): Promise<boolean> {
  const result = await client.query(
    `
      INSERT INTO notification_delivery (
        rule_id,
        channel_id,
        signal_event_id,
        digest_key,
        status,
        delivery_key,
        subject,
        body,
        payload
      )
      VALUES ($1,$2,$3,$4,'queued',$5,$6,$7,$8)
      ON CONFLICT (delivery_key) DO NOTHING
    `,
    [
      input.ruleId,
      input.channelId,
      input.signalEventId,
      input.digestKey,
      input.deliveryKey,
      input.subject,
      input.body,
      JSON.stringify(input.payload),
    ],
  );
  return Number(result.rowCount) > 0;
}

async function loadNotificationSignals(client: PoolClient, since: string, limit: number): Promise<NotificationSignal[]> {
  const result = await client.query<NotificationSignalRow>(
    `
      SELECT
        signal_event.id::text AS signal_id,
        signal_event.type,
        signal_event.severity,
        signal_event.score,
        signal_event.title,
        signal_event.detail,
        signal_event.metadata,
        signal_event.created_at::text AS created_at,
        signal_event.identity_id::text AS identity_id,
        COALESCE(catalog_item_raw.juno_id, catalog_item_identity.juno_id) AS juno_id,
        catalog_item_raw.artist,
        catalog_item_raw.title AS item_title,
        catalog_item_raw.label,
        catalog_item_raw.cat_no,
        catalog_item_raw.genre,
        catalog_item_raw.medium,
        catalog_item_raw.stock,
        catalog_item_raw.dealer_price_gbp::text AS dealer_price_gbp,
        catalog_item_raw.release_date::text AS release_date,
        COALESCE(
          array_agg(DISTINCT watch_match.reason)
            FILTER (WHERE watch_match.reason IS NOT NULL),
          ARRAY[]::text[]
        ) AS reasons
      FROM signal_event
      LEFT JOIN catalog_item_identity ON catalog_item_identity.id = signal_event.identity_id
      LEFT JOIN catalog_item_raw ON catalog_item_raw.id = signal_event.catalog_item_raw_id
      LEFT JOIN watch_match ON watch_match.catalog_item_raw_id = signal_event.catalog_item_raw_id
      WHERE signal_event.created_at >= $1
      GROUP BY
        signal_event.id,
        catalog_item_identity.id,
        catalog_item_raw.id
      ORDER BY signal_event.created_at DESC, signal_event.id DESC
      LIMIT $2
    `,
    [since, limit],
  );
  return result.rows.map(mapNotificationSignalRow);
}

async function loadCooldownDeliveries(client: PoolClient, cooldownMinutes: number): Promise<CooldownDelivery[]> {
  if (cooldownMinutes <= 0) {
    return [];
  }
  const result = await client.query<CooldownDeliveryRow>(
    `
      SELECT
        notification_delivery.rule_id::text,
        signal_event.identity_id::text,
        signal_event.type AS signal_type,
        notification_delivery.queued_at::text,
        notification_delivery.status
      FROM notification_delivery
      JOIN signal_event ON signal_event.id = notification_delivery.signal_event_id
      WHERE notification_delivery.status IN ('queued', 'sent')
        AND notification_delivery.queued_at >= now() - ($1::text || ' minutes')::interval
    `,
    [cooldownMinutes],
  );
  return result.rows.map((row) => ({
    ruleId: row.rule_id,
    identityId: row.identity_id,
    signalType: row.signal_type,
    queuedAt: row.queued_at,
    status: row.status,
  }));
}

async function listNotificationChannelsClient(queryable: Pool | PoolClient): Promise<NotificationChannel[]> {
  const result = await queryable.query<NotificationChannelRow>(
    `
      SELECT ${notificationChannelSelectColumns}
      FROM notification_channel
      ORDER BY enabled DESC, type, name
    `,
  );
  return result.rows.map(mapNotificationChannelRow);
}

async function listNotificationRulesClient(queryable: Pool | PoolClient): Promise<NotificationRule[]> {
  const result = await queryable.query<NotificationRuleRow>(
    `
      SELECT ${notificationRuleSelectColumns}
      FROM notification_rule
      JOIN notification_channel ON notification_channel.id = notification_rule.channel_id
      ORDER BY notification_rule.enabled DESC, notification_channel.name, notification_rule.name
    `,
  );
  return result.rows.map(mapNotificationRuleRow);
}

async function listActiveNotificationRulesClient(client: PoolClient): Promise<NotificationRule[]> {
  const result = await client.query<NotificationRuleRow>(
    `
      SELECT ${notificationRuleSelectColumns}
      FROM notification_rule
      JOIN notification_channel ON notification_channel.id = notification_rule.channel_id
      WHERE notification_rule.enabled = true
        AND notification_channel.enabled = true
      ORDER BY notification_channel.name, notification_rule.name
    `,
  );
  return result.rows.map(mapNotificationRuleRow);
}

function normalizeNotificationChannelInput(input: NotificationChannelInput): {
  name: string;
  type: NotificationChannelType;
  enabled: boolean;
  config: NotificationConfig;
  secretRef: string | null;
} {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Notification channel name is required");
  }
  if (!notificationChannelTypes.includes(input.type)) {
    throw new Error("Notification channel type is invalid");
  }
  return {
    name,
    type: input.type,
    enabled: input.enabled ?? true,
    config: normalizeNotificationChannelConfig(input.type, input.config ?? {}),
    secretRef: normalizeOptionalString(input.secretRef ?? null),
  };
}

function normalizeNotificationRuleInput(input: NotificationRuleInput): {
  name: string;
  channelId: string;
  enabled: boolean;
  signalTypes: SignalEventType[];
  severities: SignalSeverity[];
  minScore: number;
  includeWatchHits: boolean;
  includeDigest: boolean;
  cooldownMinutes: number;
} {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Notification rule name is required");
  }
  if (!input.channelId?.trim()) {
    throw new Error("Notification rule channel id is required");
  }
  const signalTypes = normalizeSignalTypes(input.signalTypes ?? []);
  const severities = normalizeSeverities(input.severities ?? []);
  const minScore = input.minScore ?? 0;
  if (!Number.isInteger(minScore) || minScore < -100 || minScore > 100) {
    throw new Error("Notification rule min score must be an integer between -100 and 100");
  }
  const cooldownMinutes = input.cooldownMinutes ?? 60;
  if (!Number.isInteger(cooldownMinutes) || cooldownMinutes < 0) {
    throw new Error("Notification rule cooldown must be a non-negative integer");
  }
  return {
    name,
    channelId: input.channelId.trim(),
    enabled: input.enabled ?? true,
    signalTypes,
    severities,
    minScore,
    includeWatchHits: input.includeWatchHits ?? true,
    includeDigest: input.includeDigest ?? false,
    cooldownMinutes,
  };
}

function normalizeSignalTypes(values: SignalEventType[]): SignalEventType[] {
  for (const value of values) {
    if (!notificationSignalTypes.has(value)) {
      throw new Error("Notification rule signal type is invalid");
    }
  }
  return [...new Set(values)];
}

function normalizeSeverities(values: SignalSeverity[]): SignalSeverity[] {
  for (const value of values) {
    if (!notificationSignalSeverities.has(value)) {
      throw new Error("Notification rule severity is invalid");
    }
  }
  return [...new Set(values)];
}

function normalizeConfig(value: unknown): NotificationConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Notification channel config must be an object");
  }
  return value as NotificationConfig;
}

function normalizeNotificationChannelConfig(type: NotificationChannelType, value: unknown): NotificationConfig {
  const config = normalizeConfig(value);
  if (type !== "webhook") {
    return {};
  }
  return {
    ...config,
    format: normalizeNotificationWebhookFormat(config.format),
  };
}

function normalizeOptionalString(value: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function mergeNotificationConfig(current: NotificationConfig, patch: unknown): NotificationConfig {
  const normalizedPatch = normalizeConfig(patch ?? {});
  return { ...current, ...normalizedPatch };
}

function ruleParams(rule: ReturnType<typeof normalizeNotificationRuleInput>): unknown[] {
  return [
    rule.name,
    rule.channelId,
    rule.enabled,
    rule.signalTypes,
    rule.severities,
    rule.minScore,
    rule.includeWatchHits,
    rule.includeDigest,
    rule.cooldownMinutes,
  ];
}

function maxCooldownMinutes(rules: NotificationRule[]): number {
  return rules.reduce((max, rule) => Math.max(max, rule.cooldownMinutes), 0);
}

function defaultSince(): string {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

function toUtcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

type NotificationChannelRow = {
  id: string;
  name: string;
  type: NotificationChannelType;
  enabled: boolean;
  config: NotificationConfig;
  secret_ref: string | null;
  created_at: string;
  updated_at: string;
};

const notificationChannelSelectColumns = `
  id::text,
  name,
  type,
  enabled,
  config,
  secret_ref,
  created_at::text,
  updated_at::text
`;

function mapNotificationChannelRow(row: NotificationChannelRow): NotificationChannel {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    enabled: row.enabled,
    config: maskNotificationChannelConfig(row.config, row.secret_ref),
    secretRef: row.secret_ref,
    configSummary: summarizeNotificationChannelConfig({
      type: row.type,
      config: row.config,
      secretRef: row.secret_ref,
    }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type NotificationRuleRow = {
  id: string;
  name: string;
  channel_id: string;
  channel_name: string;
  channel_type: NotificationChannelType;
  channel_enabled: boolean;
  enabled: boolean;
  signal_types: SignalEventType[];
  severities: SignalSeverity[];
  min_score: number;
  include_watch_hits: boolean;
  include_digest: boolean;
  cooldown_minutes: number;
  created_at: string;
  updated_at: string;
};

const notificationRuleSelectColumns = `
  notification_rule.id::text,
  notification_rule.name,
  notification_rule.channel_id::text,
  notification_channel.name AS channel_name,
  notification_channel.type AS channel_type,
  notification_channel.enabled AS channel_enabled,
  notification_rule.enabled,
  notification_rule.signal_types,
  notification_rule.severities,
  notification_rule.min_score,
  notification_rule.include_watch_hits,
  notification_rule.include_digest,
  notification_rule.cooldown_minutes,
  notification_rule.created_at::text,
  notification_rule.updated_at::text
`;

function mapNotificationRuleRow(row: NotificationRuleRow): NotificationRule {
  return {
    id: row.id,
    name: row.name,
    channelId: row.channel_id,
    channelName: row.channel_name,
    channelType: row.channel_type,
    channelEnabled: row.channel_enabled,
    enabled: row.enabled,
    signalTypes: row.signal_types,
    severities: row.severities,
    minScore: row.min_score,
    includeWatchHits: row.include_watch_hits,
    includeDigest: row.include_digest,
    cooldownMinutes: row.cooldown_minutes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type NotificationSignalRow = {
  signal_id: string;
  type: SignalEventType;
  severity: SignalSeverity;
  score: number;
  title: string;
  detail: string;
  metadata: NotificationConfig;
  created_at: string;
  identity_id: string | null;
  juno_id: string | null;
  artist: string | null;
  item_title: string | null;
  label: string | null;
  cat_no: string | null;
  genre: string | null;
  medium: string | null;
  stock: number | null;
  dealer_price_gbp: string | null;
  release_date: string | null;
  reasons: string[];
};

function mapNotificationSignalRow(row: NotificationSignalRow): NotificationSignal {
  return {
    signalId: row.signal_id,
    type: row.type,
    severity: row.severity,
    score: row.score,
    title: row.title,
    detail: row.detail,
    metadata: row.metadata,
    createdAt: row.created_at,
    item: {
      identityId: row.identity_id,
      junoId: row.juno_id,
      artist: row.artist,
      title: row.item_title,
      label: row.label,
      catNo: row.cat_no,
      genre: row.genre,
      medium: row.medium,
      stock: row.stock,
      dealerPriceGbp: row.dealer_price_gbp,
      releaseDate: row.release_date,
    },
    reasons: row.reasons,
  };
}

type CooldownDeliveryRow = {
  rule_id: string | null;
  identity_id: string | null;
  signal_type: SignalEventType | null;
  queued_at: string;
  status: "queued" | "sent";
};

type NotificationDeliveryRow = {
  id: string;
  rule_id: string | null;
  rule_name: string | null;
  channel_id: string | null;
  channel_name: string | null;
  channel_type: NotificationChannelType | null;
  signal_event_id: string | null;
  digest_key: string | null;
  status: NotificationDeliveryStatus;
  delivery_key: string;
  subject: string;
  body: string;
  payload: NotificationConfig;
  attempts: number;
  last_error: string | null;
  queued_at: string;
  sent_at: string | null;
  updated_at: string;
  signal_type: SignalEventType | null;
  severity: SignalSeverity | null;
  score: number | null;
};

function mapNotificationDeliveryRow(row: NotificationDeliveryRow): NotificationDelivery {
  return {
    id: row.id,
    ruleId: row.rule_id,
    ruleName: row.rule_name,
    channelId: row.channel_id,
    channelName: row.channel_name,
    channelType: row.channel_type,
    signalEventId: row.signal_event_id,
    digestKey: row.digest_key,
    status: row.status,
    deliveryKey: row.delivery_key,
    subject: row.subject,
    body: row.body,
    payload: row.payload,
    attempts: row.attempts,
    lastError: row.last_error,
    queuedAt: row.queued_at,
    sentAt: row.sent_at,
    updatedAt: row.updated_at,
    signalType: row.signal_type,
    severity: row.severity,
    score: row.score,
  };
}
