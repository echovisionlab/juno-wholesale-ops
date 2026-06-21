import { Pool, type PoolClient } from "pg";
import {
  buildCatalogIdentityKey,
  normalizeCatalogText,
  normalizeIdentityInput,
} from "./normalize";
import {
  matchWatchRulesForItem,
  summarizeWatchScore,
  type WatchMatchCandidate,
  type WatchRule,
  type WatchRuleType,
} from "./watch-matcher";
import type { SignalEventType, SignalSeverity } from "./signal-types";

export type { SignalEventType, SignalSeverity } from "./signal-types";

export type WatchRuleInput = {
  type: WatchRuleType;
  pattern: string;
  weight?: number | null;
  enabled?: boolean | null;
};

export type WatchRulePatch = {
  id: string;
  type?: WatchRuleType;
  pattern?: string;
  weight?: number;
  enabled?: boolean;
};

export type TodayInsight = {
  signalId: string;
  type: SignalEventType;
  severity: SignalSeverity;
  score: number;
  title: string;
  detail: string;
  createdAt: string;
  item: {
    identityId: string | null;
    junoId: string | null;
    artist: string | null;
    title: string | null;
    label: string | null;
    catNo: string | null;
    genre: string | null;
    medium: string | null;
    stock: number | null;
    dealerPriceGbp: string | null;
    releaseDate: string | null;
  };
  reasons: string[];
};

export type InsightsProcessingResult = {
  identityUpserts: number;
  watchMatches: number;
  signals: number;
};

type SnapshotItemRow = {
  id: string;
  identity_id: string | null;
  row_number: number;
  juno_id: string | null;
  barcode: string | null;
  artist: string | null;
  title: string | null;
  label: string | null;
  cat_no: string | null;
  medium: string | null;
  description: string | null;
  genre: string | null;
  stock: number | null;
  is_new_identity: boolean;
};

type SignalCandidate = {
  type: SignalEventType;
  severity: SignalSeverity;
  score: number;
  title: string;
  detail: string;
  metadata: Record<string, unknown>;
};

const watchRuleTypes = new Set<WatchRuleType>(["artist", "label", "genre", "keyword", "exclude_keyword"]);

export async function processInsightsForSnapshot(options: {
  databaseUrl: string;
  snapshotId: string;
}): Promise<InsightsProcessingResult> {
  const pool = new Pool({ connectionString: options.databaseUrl, max: 4 });
  const client = await pool.connect();
  try {
    return await withTransaction(client, async () => {
      const identityUpserts = await upsertCatalogItemIdentitiesForSnapshotClient(client, options.snapshotId);
      const matchResult = await matchWatchRulesForSnapshotClient(client, options.snapshotId);
      return {
        identityUpserts,
        watchMatches: matchResult.matchesInserted,
        signals: matchResult.signalsInserted,
      };
    });
  } finally {
    client.release();
    await pool.end();
  }
}

export async function upsertCatalogItemIdentitiesForSnapshot(options: {
  databaseUrl: string;
  snapshotId: string;
}): Promise<{ identityUpserts: number }> {
  const pool = new Pool({ connectionString: options.databaseUrl, max: 2 });
  const client = await pool.connect();
  try {
    const identityUpserts = await withTransaction(client, () =>
      upsertCatalogItemIdentitiesForSnapshotClient(client, options.snapshotId),
    );
    return { identityUpserts };
  } finally {
    client.release();
    await pool.end();
  }
}

export async function matchWatchRulesForSnapshot(options: {
  databaseUrl: string;
  snapshotId: string;
}): Promise<{ matchesInserted: number; signalsInserted: number }> {
  const pool = new Pool({ connectionString: options.databaseUrl, max: 4 });
  const client = await pool.connect();
  try {
    return await withTransaction(client, async () => {
      await upsertCatalogItemIdentitiesForSnapshotClient(client, options.snapshotId);
      return matchWatchRulesForSnapshotClient(client, options.snapshotId);
    });
  } finally {
    client.release();
    await pool.end();
  }
}

export async function upsertCatalogItemIdentitiesForSnapshotClient(
  client: PoolClient,
  snapshotId: string,
): Promise<number> {
  const rows = await client.query<{
    id: string;
    identity_id: string | null;
    supplier_id: string;
    juno_id: string | null;
    barcode: string | null;
    artist: string | null;
    title: string | null;
    label: string | null;
    cat_no: string | null;
  }>(
    `
      SELECT
        catalog_item_raw.id,
        catalog_item_raw.identity_id::text,
        catalog_snapshot.supplier_id,
        catalog_item_raw.juno_id,
        catalog_item_raw.barcode,
        catalog_item_raw.artist,
        catalog_item_raw.title,
        catalog_item_raw.label,
        catalog_item_raw.cat_no
      FROM catalog_item_raw
      JOIN catalog_snapshot ON catalog_snapshot.id = catalog_item_raw.snapshot_id
      WHERE catalog_item_raw.snapshot_id = $1
      ORDER BY catalog_item_raw.row_number
    `,
    [snapshotId],
  );

  let identityUpserts = 0;
  for (const row of rows.rows) {
    const identityInput = {
      junoId: row.juno_id,
      barcode: row.barcode,
      artist: row.artist,
      title: row.title,
      label: row.label,
      catNo: row.cat_no,
    };
    const identityKey = buildCatalogIdentityKey(identityInput);
    if (!identityKey) {
      continue;
    }

    const normalized = normalizeIdentityInput(identityInput);
    const identity = await client.query<{ id: string }>(
      `
        INSERT INTO catalog_item_identity (
          supplier_id,
          identity_key,
          juno_id,
          barcode,
          artist_norm,
          title_norm,
          label_norm,
          cat_no_norm
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (supplier_id, identity_key) DO UPDATE SET
          juno_id = COALESCE(EXCLUDED.juno_id, catalog_item_identity.juno_id),
          barcode = COALESCE(EXCLUDED.barcode, catalog_item_identity.barcode),
          artist_norm = COALESCE(EXCLUDED.artist_norm, catalog_item_identity.artist_norm),
          title_norm = COALESCE(EXCLUDED.title_norm, catalog_item_identity.title_norm),
          label_norm = COALESCE(EXCLUDED.label_norm, catalog_item_identity.label_norm),
          cat_no_norm = COALESCE(EXCLUDED.cat_no_norm, catalog_item_identity.cat_no_norm),
          updated_at = now()
        RETURNING id
      `,
      [
        row.supplier_id,
        identityKey,
        normalized.junoId,
        normalized.barcode,
        normalized.artistNorm,
        normalized.titleNorm,
        normalized.labelNorm,
        normalized.catNoNorm,
      ],
    );
    if (row.identity_id !== identity.rows[0].id) {
      await client.query(
        `
          UPDATE catalog_item_raw
          SET identity_id = $2
          WHERE id = $1
        `,
        [row.id, identity.rows[0].id],
      );
      identityUpserts += 1;
    }
  }
  return identityUpserts;
}

async function matchWatchRulesForSnapshotClient(
  client: PoolClient,
  snapshotId: string,
): Promise<{ matchesInserted: number; signalsInserted: number }> {
  const [rules, items] = await Promise.all([
    listActiveWatchRulesClient(client),
    loadSnapshotItems(client, snapshotId),
  ]);
  const firstNewIdentityRows = new Set<string>();
  let matchesInserted = 0;
  let signalsInserted = 0;

  for (const item of items) {
    if (!item.identity_id) {
      continue;
    }

    const matches = matchWatchRulesForItem(
      {
        artist: item.artist,
        title: item.title,
        label: item.label,
        genre: item.genre,
        medium: item.medium,
        description: item.description,
        catNo: item.cat_no,
      },
      rules,
    );

    for (const match of matches) {
      matchesInserted += await insertWatchMatch(client, item, match);
    }

    const signalCandidates = buildSignalCandidates({
      item,
      matches,
      isFirstNewIdentityRow: item.is_new_identity && !firstNewIdentityRows.has(item.identity_id),
    });
    firstNewIdentityRows.add(item.identity_id);

    for (const signal of signalCandidates) {
      signalsInserted += await insertSignalEvent(client, item, signal);
    }
  }

  return { matchesInserted, signalsInserted };
}

export async function listWatchRules(databaseUrl: string): Promise<WatchRule[]> {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    return await listWatchRulesClient(pool);
  } finally {
    await pool.end();
  }
}

export async function createWatchRule(databaseUrl: string, input: WatchRuleInput): Promise<WatchRule> {
  const normalized = normalizeWatchRuleInput(input);
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    const result = await pool.query<WatchRuleRow>(
      `
        INSERT INTO watch_rule (type, pattern, pattern_norm, weight, enabled)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (type, pattern_norm) DO UPDATE SET
          pattern = EXCLUDED.pattern,
          weight = EXCLUDED.weight,
          enabled = EXCLUDED.enabled,
          updated_at = now()
        RETURNING ${watchRuleSelectColumns}
      `,
      [normalized.type, normalized.pattern, normalized.patternNorm, normalized.weight, normalized.enabled],
    );
    return mapWatchRuleRow(result.rows[0]);
  } finally {
    await pool.end();
  }
}

export async function updateWatchRule(databaseUrl: string, patch: WatchRulePatch): Promise<WatchRule | null> {
  if (!patch.id) {
    throw new Error("Watch rule id is required");
  }
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    const current = await pool.query<WatchRuleRow>(
      `
        SELECT ${watchRuleSelectColumns}
        FROM watch_rule
        WHERE id = $1
      `,
      [patch.id],
    );
    if (!current.rows[0]) {
      return null;
    }
    const merged = normalizeWatchRuleInput({
      type: patch.type ?? current.rows[0].type,
      pattern: patch.pattern ?? current.rows[0].pattern,
      weight: patch.weight ?? current.rows[0].weight,
      enabled: patch.enabled ?? current.rows[0].enabled,
    });
    const updated = await pool.query<WatchRuleRow>(
      `
        UPDATE watch_rule
        SET type = $2,
            pattern = $3,
            pattern_norm = $4,
            weight = $5,
            enabled = $6,
            updated_at = now()
        WHERE id = $1
        RETURNING ${watchRuleSelectColumns}
      `,
      [patch.id, merged.type, merged.pattern, merged.patternNorm, merged.weight, merged.enabled],
    );
    return mapWatchRuleRow(updated.rows[0]);
  } finally {
    await pool.end();
  }
}

export async function deleteWatchRule(databaseUrl: string, id: string): Promise<boolean> {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    const result = await pool.query("DELETE FROM watch_rule WHERE id = $1", [id]);
    return Number(result.rowCount) > 0;
  } finally {
    await pool.end();
  }
}

export async function getTodaySignals(databaseUrl: string, limit: number): Promise<TodayInsight[]> {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    const result = await pool.query<TodayInsightRow>(
      `
        SELECT
          signal_event.id::text AS signal_id,
          signal_event.type,
          signal_event.severity,
          signal_event.score,
          signal_event.title,
          signal_event.detail,
          signal_event.created_at::text AS created_at,
          catalog_item_identity.id::text AS identity_id,
          catalog_item_identity.juno_id,
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
        JOIN catalog_item_identity ON catalog_item_identity.id = signal_event.identity_id
        LEFT JOIN catalog_item_raw ON catalog_item_raw.id = signal_event.catalog_item_raw_id
        LEFT JOIN watch_match ON watch_match.catalog_item_raw_id = signal_event.catalog_item_raw_id
        WHERE signal_event.created_at >= date_trunc('day', now())
          AND signal_event.type IN ('new_arrival', 'watch_hit', 'low_catalog_stock', 'exclude_match')
        GROUP BY
          signal_event.id,
          catalog_item_identity.id,
          catalog_item_raw.id
        ORDER BY signal_event.score DESC, signal_event.created_at DESC
        LIMIT $1
      `,
      [limit],
    );
    return result.rows.map(mapTodayInsightRow);
  } finally {
    await pool.end();
  }
}

async function loadSnapshotItems(client: PoolClient, snapshotId: string): Promise<SnapshotItemRow[]> {
  const result = await client.query<SnapshotItemRow>(
    `
      SELECT
        catalog_item_raw.id::text,
        catalog_item_raw.identity_id::text,
        catalog_item_raw.row_number,
        catalog_item_raw.juno_id,
        catalog_item_raw.barcode,
        catalog_item_raw.artist,
        catalog_item_raw.title,
        catalog_item_raw.label,
        catalog_item_raw.cat_no,
        catalog_item_raw.medium,
        catalog_item_raw.description,
        catalog_item_raw.genre,
        catalog_item_raw.stock,
        NOT EXISTS (
          SELECT 1
          FROM catalog_item_raw prior
          JOIN catalog_snapshot prior_snapshot ON prior_snapshot.id = prior.snapshot_id
          WHERE prior.identity_id = catalog_item_raw.identity_id
            AND prior.snapshot_id <> catalog_item_raw.snapshot_id
            AND prior_snapshot.created_at < catalog_snapshot.created_at
        ) AS is_new_identity
      FROM catalog_item_raw
      JOIN catalog_snapshot ON catalog_snapshot.id = catalog_item_raw.snapshot_id
      WHERE catalog_item_raw.snapshot_id = $1
      ORDER BY catalog_item_raw.row_number
    `,
    [snapshotId],
  );
  return result.rows;
}

function buildSignalCandidates(options: {
  item: SnapshotItemRow;
  matches: WatchMatchCandidate[];
  isFirstNewIdentityRow: boolean;
}): SignalCandidate[] {
  const signals: SignalCandidate[] = [];
  const positiveMatches = options.matches.filter((match) => match.rule.type !== "exclude_keyword");
  const excludeMatches = options.matches.filter((match) => match.rule.type === "exclude_keyword");
  const score = summarizeWatchScore(options.matches);

  if (options.isFirstNewIdentityRow) {
    signals.push({
      type: "new_arrival",
      severity: "info",
      score: 1,
      title: `New catalog arrival: ${itemDisplayName(options.item)}`,
      detail: "First observed in this XLSX catalog snapshot.",
      metadata: { rowNumber: options.item.row_number },
    });
  }

  if (positiveMatches.length > 0) {
    signals.push({
      type: "watch_hit",
      severity: "watch",
      score: score.totalScore,
      title: `Watch hit: ${itemDisplayName(options.item)}`,
      detail: `Observed catalog row matched ${positiveMatches.length} watch rule(s).`,
      metadata: {
        positiveScore: score.positiveScore,
        excludeScore: score.excludeScore,
        ruleIds: positiveMatches.map((match) => match.rule.id),
      },
    });
  }

  if (options.item.stock !== null && options.item.stock <= 3) {
    signals.push({
      type: "low_catalog_stock",
      severity: "warning",
      score: 4 - options.item.stock,
      title: `Low catalog stock: ${itemDisplayName(options.item)}`,
      detail: `Catalog stock field reports ${options.item.stock} units in the latest XLSX snapshot.`,
      metadata: { source: "catalog", stock: options.item.stock },
    });
  }

  if (excludeMatches.length > 0) {
    signals.push({
      type: "exclude_match",
      severity: "info",
      score: score.excludeScore,
      title: `Exclude match: ${itemDisplayName(options.item)}`,
      detail: `Observed catalog row matched ${excludeMatches.length} exclude keyword rule(s).`,
      metadata: {
        ruleIds: excludeMatches.map((match) => match.rule.id),
        excludeScore: score.excludeScore,
      },
    });
  }

  return signals;
}

async function insertWatchMatch(
  client: PoolClient,
  item: SnapshotItemRow,
  match: WatchMatchCandidate,
): Promise<number> {
  const result = await client.query(
    `
      INSERT INTO watch_match (
        watch_rule_id,
        identity_id,
        catalog_item_raw_id,
        matched_field,
        score,
        reason
      )
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (watch_rule_id, catalog_item_raw_id, matched_field) WHERE catalog_item_raw_id IS NOT NULL
        DO NOTHING
    `,
    [match.rule.id, item.identity_id, item.id, match.matchedField, match.score, match.reason],
  );
  return Number(result.rowCount);
}

async function insertSignalEvent(
  client: PoolClient,
  item: SnapshotItemRow,
  signal: SignalCandidate,
): Promise<number> {
  const result = await client.query(
    `
      INSERT INTO signal_event (
        identity_id,
        catalog_item_raw_id,
        type,
        severity,
        score,
        title,
        detail,
        metadata
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (type, catalog_item_raw_id) WHERE catalog_item_raw_id IS NOT NULL
        DO NOTHING
    `,
    [
      item.identity_id,
      item.id,
      signal.type,
      signal.severity,
      signal.score,
      signal.title,
      signal.detail,
      JSON.stringify(signal.metadata),
    ],
  );
  return Number(result.rowCount);
}

async function listActiveWatchRulesClient(client: PoolClient): Promise<WatchRule[]> {
  const result = await client.query<WatchRuleRow>(
    `
      SELECT ${watchRuleSelectColumns}
      FROM watch_rule
      WHERE enabled = true
      ORDER BY type, pattern_norm
    `,
  );
  return result.rows.map(mapWatchRuleRow);
}

async function listWatchRulesClient(queryable: Pool | PoolClient): Promise<WatchRule[]> {
  const result = await queryable.query<WatchRuleRow>(
    `
      SELECT ${watchRuleSelectColumns}
      FROM watch_rule
      ORDER BY enabled DESC, type, pattern_norm
    `,
  );
  return result.rows.map(mapWatchRuleRow);
}

function normalizeWatchRuleInput(input: WatchRuleInput): {
  type: WatchRuleType;
  pattern: string;
  patternNorm: string;
  weight: number;
  enabled: boolean;
} {
  if (!watchRuleTypes.has(input.type)) {
    throw new Error("Watch rule type is invalid");
  }
  const pattern = input.pattern.trim();
  const patternNorm = normalizeCatalogText(pattern);
  if (!patternNorm) {
    throw new Error("Watch rule pattern is required");
  }
  const defaultWeight = input.type === "exclude_keyword" ? -10 : 10;
  const weight = input.weight ?? defaultWeight;
  if (!Number.isInteger(weight) || weight < -100 || weight > 100) {
    throw new Error("Watch rule weight must be an integer between -100 and 100");
  }

  return {
    type: input.type,
    pattern,
    patternNorm,
    weight,
    enabled: input.enabled ?? true,
  };
}

function itemDisplayName(item: SnapshotItemRow): string {
  const artist = item.artist?.trim();
  const title = item.title?.trim();
  if (artist && title) {
    return `${artist} - ${title}`;
  }
  return title || artist || item.juno_id || item.cat_no || "Catalog item";
}

type WatchRuleRow = {
  id: string;
  type: WatchRuleType;
  pattern: string;
  pattern_norm: string;
  weight: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

const watchRuleSelectColumns = `
  id::text,
  type,
  pattern,
  pattern_norm,
  weight,
  enabled,
  created_at::text,
  updated_at::text
`;

function mapWatchRuleRow(row: WatchRuleRow): WatchRule {
  return {
    id: row.id,
    type: row.type,
    pattern: row.pattern,
    patternNorm: row.pattern_norm,
    weight: row.weight,
    enabled: row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type TodayInsightRow = {
  signal_id: string;
  type: SignalEventType;
  severity: SignalSeverity;
  score: number;
  title: string;
  detail: string;
  created_at: string;
  identity_id: string;
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

function mapTodayInsightRow(row: TodayInsightRow): TodayInsight {
  return {
    signalId: row.signal_id,
    type: row.type,
    severity: row.severity,
    score: row.score,
    title: row.title,
    detail: row.detail,
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

async function withTransaction<T>(client: PoolClient, fn: () => Promise<T>): Promise<T> {
  await client.query("BEGIN");
  try {
    const result = await fn();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
