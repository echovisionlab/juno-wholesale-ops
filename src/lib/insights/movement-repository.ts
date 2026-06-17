import { Pool, type PoolClient } from "pg";
import { normalizeCatalogText } from "./normalize";
import type { SignalEventType, SignalSeverity, TodayInsight } from "./repository";
import {
  buildCurrentObservationSignalCandidates,
  buildMovementSignalCandidates,
  movementSignalTypes,
  type LiveObservationStatus,
  type MovementObservation,
  type MovementSignalCandidate,
} from "./movement";

export type MovementProcessingResult = {
  observationsScanned: number;
  signalsInserted: number;
  restocks: number;
  stockDrops: number;
  lowLiveStock: number;
  statusChanges: number;
  priceChanges: number;
  fastMoverCandidates: number;
};

type MovementObservationRow = {
  id: string;
  identity_id: string;
  catalog_item_raw_id: string | null;
  juno_id: string | null;
  status: LiveObservationStatus;
  stock_quantity: number | null;
  display_stock: string | null;
  wholesale_price_gbp: string | null;
  observed_at: string;
  artist: string | null;
  item_title: string | null;
  label: string | null;
};

type SignalRow = {
  signal_id: string;
  type: SignalEventType;
  severity: SignalSeverity;
  score: number;
  title: string;
  detail: string;
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

export async function processMovementSignalsForRecentObservations(options: {
  databaseUrl: string;
  lookbackHours?: number;
  lowStockThreshold?: number;
}): Promise<MovementProcessingResult> {
  const pool = new Pool({ connectionString: options.databaseUrl, max: 4 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const observations = await loadRecentMovementObservations(client, options.lookbackHours ?? 48);
    const result = emptyProcessingResult(observations.length);
    const previousByIdentity = new Map<string, MovementObservation>();

    for (const current of observations) {
      const previous = previousByIdentity.get(current.identityId);
      const candidates = previous
        ? buildMovementSignalCandidates(previous, current, { lowStockThreshold: options.lowStockThreshold ?? 3 })
        : buildCurrentObservationSignalCandidates(current, { lowStockThreshold: options.lowStockThreshold ?? 3 });
      for (const candidate of candidates) {
        const inserted = await insertMovementSignal(client, candidate);
        if (inserted > 0) {
          incrementProcessingResult(result, candidate.type);
        }
      }
      previousByIdentity.set(current.identityId, current);
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

export async function getMovementSignals(databaseUrl: string, limit: number): Promise<TodayInsight[]> {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    const result = await pool.query<SignalRow>(
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
        WHERE signal_event.type = ANY($2::text[])
        GROUP BY
          signal_event.id,
          catalog_item_identity.id,
          catalog_item_raw.id
        ORDER BY signal_event.score DESC, signal_event.created_at DESC
        LIMIT $1
      `,
      [limit, movementSignalTypes],
    );
    return result.rows.map(mapSignalRow);
  } finally {
    await pool.end();
  }
}

export async function resolveLiveObservationIdentityIdClient(
  client: PoolClient,
  input: { catalogItemRawId: string | null; junoId: string | null },
): Promise<string | null> {
  if (input.catalogItemRawId) {
    const raw = await client.query<{ identity_id: string | null }>(
      "SELECT identity_id::text FROM catalog_item_raw WHERE id = $1",
      [input.catalogItemRawId],
    );
    if (raw.rows[0]?.identity_id) {
      return raw.rows[0].identity_id;
    }
  }

  const junoIdNorm = normalizeCatalogText(input.junoId);
  if (!junoIdNorm) {
    return null;
  }
  const identity = await client.query<{ id: string }>(
    `
      SELECT id::text
      FROM catalog_item_identity
      WHERE juno_id = $1
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    [junoIdNorm],
  );
  return identity.rows[0]?.id ?? null;
}

async function loadRecentMovementObservations(client: PoolClient, lookbackHours: number): Promise<MovementObservation[]> {
  const result = await client.query<MovementObservationRow>(
    `
      SELECT
        juno_live_observation.id::text,
        juno_live_observation.identity_id::text,
        juno_live_observation.catalog_item_raw_id::text,
        juno_live_observation.juno_id,
        juno_live_observation.status,
        juno_live_observation.stock_quantity,
        juno_live_observation.display_stock,
        juno_live_observation.wholesale_price_gbp::text,
        juno_live_observation.observed_at::text,
        catalog_item_raw.artist,
        catalog_item_raw.title AS item_title,
        catalog_item_raw.label
      FROM juno_live_observation
      LEFT JOIN catalog_item_raw ON catalog_item_raw.id = juno_live_observation.catalog_item_raw_id
      WHERE juno_live_observation.identity_id IS NOT NULL
        AND juno_live_observation.observed_at >= now() - ($1::text || ' hours')::interval
      ORDER BY juno_live_observation.identity_id, juno_live_observation.observed_at, juno_live_observation.id
    `,
    [lookbackHours],
  );
  return result.rows.map((row) => ({
    id: row.id,
    identityId: row.identity_id,
    catalogItemRawId: row.catalog_item_raw_id,
    junoId: row.juno_id,
    status: row.status,
    stockQuantity: row.stock_quantity,
    displayStock: row.display_stock,
    wholesalePriceGbp: row.wholesale_price_gbp === null ? null : Number(row.wholesale_price_gbp),
    observedAt: row.observed_at,
    artist: row.artist,
    title: row.item_title,
    label: row.label,
  }));
}

async function insertMovementSignal(client: PoolClient, signal: MovementSignalCandidate): Promise<number> {
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
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (event_key) WHERE event_key IS NOT NULL
        DO NOTHING
    `,
    [
      signal.identityId,
      signal.catalogItemRawId,
      signal.type,
      signal.severity,
      signal.score,
      signal.title,
      signal.detail,
      JSON.stringify(signal.metadata),
      signal.eventKey,
    ],
  );
  return Number(result.rowCount);
}

function emptyProcessingResult(observationsScanned: number): MovementProcessingResult {
  return {
    observationsScanned,
    signalsInserted: 0,
    restocks: 0,
    stockDrops: 0,
    lowLiveStock: 0,
    statusChanges: 0,
    priceChanges: 0,
    fastMoverCandidates: 0,
  };
}

function incrementProcessingResult(result: MovementProcessingResult, type: SignalEventType) {
  result.signalsInserted += 1;
  if (type === "observed_restock") {
    result.restocks += 1;
  } else if (type === "observed_stock_drop") {
    result.stockDrops += 1;
  } else if (type === "observed_live_low_stock") {
    result.lowLiveStock += 1;
  } else if (type === "observed_status_change") {
    result.statusChanges += 1;
  } else if (type === "observed_price_change") {
    result.priceChanges += 1;
  } else {
    result.fastMoverCandidates += 1;
  }
}

function mapSignalRow(row: SignalRow): TodayInsight {
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
