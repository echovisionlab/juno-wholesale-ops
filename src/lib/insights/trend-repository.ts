import { Pool, type PoolClient } from "pg";
import { normalizeCatalogText } from "./normalize";
import type { SignalSeverity, TodayInsight } from "./repository";
import type { WatchRuleType } from "./watch-matcher";
import { getMovementSignals } from "./movement-repository";

export type TrendBucket = {
  key: string;
  label: string;
  currentCount: number;
  previousCount: number;
  delta: number;
  percentChange: number | null;
  watchHitCount: number;
};

export type CatalogTrendSummary = {
  window: {
    currentFrom: string;
    currentTo: string;
    previousFrom: string;
    previousTo: string;
  };
  genres: TrendBucket[];
  labels: TrendBucket[];
  watchOverlap: TrendBucket[];
};

export type TrendRefreshResult = {
  signalsInserted: number;
  trendSpikes: number;
};

export type InsightDigest = {
  generatedAt: string;
  counts: {
    watchHitsToday: number;
    lowCatalogStockToday: number;
    lowLiveStockToday: number;
    restocksToday: number;
    fastMoverCandidatesToday: number;
  };
  topSignals: TodayInsight[];
  topGenres: TrendBucket[];
  topLabels: TrendBucket[];
};

type TrendOptions = {
  databaseUrl: string;
  windowDays?: number;
  previousWindowDays?: number;
  limit?: number;
  now?: Date;
};

type CatalogTrendRow = {
  catalog_item_raw_id: string;
  snapshot_created_at: string;
  genre: string | null;
  label: string | null;
};

type WatchTrendRow = CatalogTrendRow & {
  watch_match_id: string;
  rule_type: WatchRuleType;
  pattern: string;
  pattern_norm: string;
};

type MutableTrendBucket = Omit<TrendBucket, "delta" | "percentChange"> & {
  currentIds: Set<string>;
  previousIds: Set<string>;
  watchHitIds: Set<string>;
};

export async function getCatalogTrends(options: TrendOptions): Promise<CatalogTrendSummary> {
  const pool = new Pool({ connectionString: options.databaseUrl, max: 4 });
  try {
    return await getCatalogTrendsWithPool(pool, options);
  } finally {
    await pool.end();
  }
}

export async function refreshCatalogTrendSignals(options: TrendOptions): Promise<TrendRefreshResult> {
  const pool = new Pool({ connectionString: options.databaseUrl, max: 4 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const summary = await getCatalogTrendsWithPool(client, options);
    let signalsInserted = 0;
    let trendSpikes = 0;
    for (const [kind, buckets] of [
      ["genre", summary.genres],
      ["label", summary.labels],
    ] as const) {
      for (const bucket of buckets) {
        if (!isTrendSpike(bucket)) {
          continue;
        }
        trendSpikes += 1;
        signalsInserted += await insertTrendSpikeSignal(client, kind, bucket, summary);
      }
    }
    await client.query("COMMIT");
    return { signalsInserted, trendSpikes };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

export async function getInsightDigest(databaseUrl: string): Promise<InsightDigest> {
  const [counts, topSignals, trends] = await Promise.all([
    getDailySignalCounts(databaseUrl),
    getMovementSignals(databaseUrl, 5),
    getCatalogTrends({ databaseUrl, limit: 5 }),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    counts,
    topSignals,
    topGenres: trends.genres.slice(0, 5),
    topLabels: trends.labels.slice(0, 5),
  };
}

async function getCatalogTrendsWithPool(queryable: Pool | PoolClient, options: TrendOptions): Promise<CatalogTrendSummary> {
  const bounds = buildTrendWindowBounds(options.now ?? new Date(), options.windowDays ?? 7, options.previousWindowDays ?? 7);
  const limit = options.limit ?? 20;
  const items = await loadCatalogTrendRows(queryable, bounds);
  const watchRows = await loadWatchTrendRows(queryable, bounds);
  const genreBuckets = buildFieldBuckets(items, watchRows, bounds, "genre", limit);
  const labelBuckets = buildFieldBuckets(items, watchRows, bounds, "label", limit);
  const watchOverlap = buildWatchOverlapBuckets(watchRows, bounds, limit);
  return {
    window: {
      currentFrom: bounds.currentFrom.toISOString(),
      currentTo: bounds.currentTo.toISOString(),
      previousFrom: bounds.previousFrom.toISOString(),
      previousTo: bounds.previousTo.toISOString(),
    },
    genres: genreBuckets,
    labels: labelBuckets,
    watchOverlap,
  };
}

async function loadCatalogTrendRows(
  queryable: Pool | PoolClient,
  bounds: TrendWindowBounds,
): Promise<CatalogTrendRow[]> {
  const result = await queryable.query<CatalogTrendRow>(
    `
      SELECT
        catalog_item_raw.id::text AS catalog_item_raw_id,
        catalog_snapshot.created_at::text AS snapshot_created_at,
        catalog_item_raw.genre,
        catalog_item_raw.label
      FROM catalog_item_raw
      JOIN catalog_snapshot ON catalog_snapshot.id = catalog_item_raw.snapshot_id
      WHERE catalog_snapshot.created_at >= $1
        AND catalog_snapshot.created_at < $2
    `,
    [bounds.previousFrom, bounds.currentTo],
  );
  return result.rows;
}

async function loadWatchTrendRows(queryable: Pool | PoolClient, bounds: TrendWindowBounds): Promise<WatchTrendRow[]> {
  const result = await queryable.query<WatchTrendRow>(
    `
      SELECT
        watch_match.id::text AS watch_match_id,
        catalog_item_raw.id::text AS catalog_item_raw_id,
        catalog_snapshot.created_at::text AS snapshot_created_at,
        catalog_item_raw.genre,
        catalog_item_raw.label,
        watch_rule.type AS rule_type,
        watch_rule.pattern,
        watch_rule.pattern_norm
      FROM watch_match
      JOIN watch_rule ON watch_rule.id = watch_match.watch_rule_id
      JOIN catalog_item_raw ON catalog_item_raw.id = watch_match.catalog_item_raw_id
      JOIN catalog_snapshot ON catalog_snapshot.id = catalog_item_raw.snapshot_id
      WHERE catalog_snapshot.created_at >= $1
        AND catalog_snapshot.created_at < $2
        AND watch_rule.type <> 'exclude_keyword'
    `,
    [bounds.previousFrom, bounds.currentTo],
  );
  return result.rows;
}

function buildFieldBuckets(
  items: CatalogTrendRow[],
  watchRows: WatchTrendRow[],
  bounds: TrendWindowBounds,
  field: "genre" | "label",
  limit: number,
): TrendBucket[] {
  const buckets = new Map<string, MutableTrendBucket>();
  for (const item of items) {
    const key = normalizeCatalogText(item[field]);
    if (!key) {
      continue;
    }
    const bucket = getMutableBucket(buckets, key, item[field] as string);
    if (isCurrentWindow(item.snapshot_created_at, bounds)) {
      bucket.currentIds.add(item.catalog_item_raw_id);
    } else {
      bucket.previousIds.add(item.catalog_item_raw_id);
    }
  }
  for (const row of watchRows) {
    const key = normalizeCatalogText(row[field]);
    if (!key || !isCurrentWindow(row.snapshot_created_at, bounds)) {
      continue;
    }
    getMutableBucket(buckets, key, row[field] as string).watchHitIds.add(row.watch_match_id);
  }
  return finalizeBuckets(buckets, limit);
}

function buildWatchOverlapBuckets(watchRows: WatchTrendRow[], bounds: TrendWindowBounds, limit: number): TrendBucket[] {
  const buckets = new Map<string, MutableTrendBucket>();
  for (const row of watchRows) {
    const key = `${row.rule_type}:${row.pattern_norm}`;
    const bucket = getMutableBucket(buckets, key, `${watchRuleTypeLabel(row.rule_type)}: ${row.pattern}`);
    if (isCurrentWindow(row.snapshot_created_at, bounds)) {
      bucket.currentIds.add(row.catalog_item_raw_id);
      bucket.watchHitIds.add(row.watch_match_id);
    } else {
      bucket.previousIds.add(row.catalog_item_raw_id);
    }
  }
  return finalizeBuckets(buckets, limit);
}

function getMutableBucket(buckets: Map<string, MutableTrendBucket>, key: string, label: string): MutableTrendBucket {
  const existing = buckets.get(key);
  if (existing) {
    return existing;
  }
  const bucket: MutableTrendBucket = {
    key,
    label: label.trim(),
    currentCount: 0,
    previousCount: 0,
    watchHitCount: 0,
    currentIds: new Set(),
    previousIds: new Set(),
    watchHitIds: new Set(),
  };
  buckets.set(key, bucket);
  return bucket;
}

function finalizeBuckets(buckets: Map<string, MutableTrendBucket>, limit: number): TrendBucket[] {
  return [...buckets.values()]
    .map((bucket) => {
      const currentCount = bucket.currentIds.size;
      const previousCount = bucket.previousIds.size;
      const delta = currentCount - previousCount;
      return {
        key: bucket.key,
        label: bucket.label,
        currentCount,
        previousCount,
        delta,
        percentChange: previousCount === 0 ? null : Math.round((delta / previousCount) * 100),
        watchHitCount: bucket.watchHitIds.size,
      };
    })
    .sort((left, right) => right.currentCount - left.currentCount || right.delta - left.delta || left.label.localeCompare(right.label))
    .slice(0, limit);
}

function isTrendSpike(bucket: TrendBucket): boolean {
  return bucket.currentCount >= 5 && bucket.delta >= 3 && bucket.percentChange !== null && bucket.percentChange >= 100;
}

async function insertTrendSpikeSignal(
  client: PoolClient,
  kind: "genre" | "label",
  bucket: TrendBucket,
  summary: CatalogTrendSummary,
): Promise<number> {
  const severity: SignalSeverity = "watch";
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
        metadata,
        event_key
      )
      VALUES (NULL,NULL,'trend_spike',$1,$2,$3,$4,$5,$6)
      ON CONFLICT (event_key) WHERE event_key IS NOT NULL
        DO NOTHING
    `,
    [
      severity,
      Math.min(100, Math.max(10, bucket.delta * 5)),
      `Catalog trend spike: ${bucket.label}`,
      `Catalog trend spike: ${bucket.label} appeared ${bucket.currentCount} times in the current window, up from ${bucket.previousCount} in the previous window.`,
      JSON.stringify({
        kind,
        key: bucket.key,
        currentCount: bucket.currentCount,
        previousCount: bucket.previousCount,
        delta: bucket.delta,
        percentChange: bucket.percentChange,
        window: summary.window,
      }),
      `trend:${kind}:${bucket.key}:${summary.window.currentFrom}:${summary.window.currentTo}`,
    ],
  );
  return Number(result.rowCount);
}

async function getDailySignalCounts(databaseUrl: string): Promise<InsightDigest["counts"]> {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    const result = await pool.query<{ type: string; count: string }>(
      `
        SELECT type, count(*)::text AS count
        FROM signal_event
        WHERE created_at >= date_trunc('day', now())
          AND type IN (
            'watch_hit',
            'low_catalog_stock',
            'observed_live_low_stock',
            'observed_restock',
            'fast_mover_candidate'
          )
        GROUP BY type
      `,
    );
    const counts = Object.fromEntries(result.rows.map((row) => [row.type, Number(row.count)]));
    return {
      watchHitsToday: counts.watch_hit ?? 0,
      lowCatalogStockToday: counts.low_catalog_stock ?? 0,
      lowLiveStockToday: counts.observed_live_low_stock ?? 0,
      restocksToday: counts.observed_restock ?? 0,
      fastMoverCandidatesToday: counts.fast_mover_candidate ?? 0,
    };
  } finally {
    await pool.end();
  }
}

type TrendWindowBounds = {
  currentFrom: Date;
  currentTo: Date;
  previousFrom: Date;
  previousTo: Date;
};

function buildTrendWindowBounds(now: Date, windowDays: number, previousWindowDays: number): TrendWindowBounds {
  const currentTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const currentFrom = new Date(currentTo.getTime() - windowDays * 86_400_000);
  const previousTo = currentFrom;
  const previousFrom = new Date(previousTo.getTime() - previousWindowDays * 86_400_000);
  return { currentFrom, currentTo, previousFrom, previousTo };
}

function isCurrentWindow(snapshotCreatedAt: string, bounds: TrendWindowBounds): boolean {
  const value = new Date(snapshotCreatedAt);
  return value >= bounds.currentFrom && value < bounds.currentTo;
}

function watchRuleTypeLabel(type: WatchRuleType): string {
  if (type === "artist") {
    return "Artist";
  }
  if (type === "label") {
    return "Label";
  }
  if (type === "genre") {
    return "Genre";
  }
  return "Keyword";
}
