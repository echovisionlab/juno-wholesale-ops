import type { SignalEventType, SignalSeverity } from "./repository";

export type LiveObservationStatus =
  | "in_stock"
  | "out_of_stock"
  | "preorder"
  | "coming_soon"
  | "unknown"
  | "failed"
  | "blocked";

export type MovementObservation = {
  id: string;
  identityId: string;
  catalogItemRawId: string | null;
  junoId: string | null;
  status: LiveObservationStatus;
  stockQuantity: number | null;
  displayStock: string | null;
  wholesalePriceGbp: number | null;
  observedAt: string;
  artist: string | null;
  title: string | null;
  label: string | null;
};

export type MovementSignalCandidate = {
  type: SignalEventType;
  severity: SignalSeverity;
  score: number;
  title: string;
  detail: string;
  eventKey: string;
  identityId: string;
  catalogItemRawId: string | null;
  metadata: Record<string, unknown>;
};

export type MovementSignalOptions = {
  lowStockThreshold?: number;
  fastMoverLookbackHours?: number;
};

export const movementSignalTypes = [
  "observed_restock",
  "observed_stock_drop",
  "observed_live_low_stock",
  "observed_status_change",
  "observed_price_change",
  "fast_mover_candidate",
] as const satisfies SignalEventType[];

const restockFromStatuses = new Set<LiveObservationStatus>(["out_of_stock", "unknown", "failed"]);
const restockToStatuses = new Set<LiveObservationStatus>(["in_stock", "preorder", "coming_soon"]);
const stockedStatuses = new Set<LiveObservationStatus>(["in_stock", "preorder", "coming_soon"]);

export function buildMovementSignalCandidates(
  previous: MovementObservation,
  current: MovementObservation,
  options: MovementSignalOptions = {},
): MovementSignalCandidate[] {
  const lowStockThreshold = options.lowStockThreshold ?? 3;
  const fastMoverLookbackHours = options.fastMoverLookbackHours ?? 48;
  const signals = [...buildCurrentObservationSignalCandidates(current, { lowStockThreshold, fastMoverLookbackHours })];
  const stockDrop = getStockDrop(previous, current);

  if (isObservedRestock(previous, current)) {
    signals.push({
      type: "observed_restock",
      severity: "watch",
      score: current.stockQuantity === null ? 20 : Math.min(100, Math.max(20, current.stockQuantity * 8)),
      title: `Observed restock: ${itemDisplayName(current)}`,
      detail: `Live lookup changed from ${previous.status} to ${current.status} for this item.`,
      eventKey: pairEventKey("observed_restock", previous, current),
      identityId: current.identityId,
      catalogItemRawId: current.catalogItemRawId,
      metadata: pairMetadata(previous, current),
    });
  }

  if (stockDrop !== null) {
    signals.push({
      type: "observed_stock_drop",
      severity: stockDrop >= 3 ? "warning" : "info",
      score: Math.min(100, stockDrop * 10),
      title: `Observed stock change: ${itemDisplayName(current)}`,
      detail: `Observed live stock changed from ${previous.stockQuantity} to ${current.stockQuantity}.`,
      eventKey: pairEventKey("observed_stock_drop", previous, current),
      identityId: current.identityId,
      catalogItemRawId: current.catalogItemRawId,
      metadata: { ...pairMetadata(previous, current), stockDrop },
    });
  }

  if (previous.status !== current.status) {
    signals.push({
      type: "observed_status_change",
      severity: "info",
      score: 5,
      title: `Observed status change: ${itemDisplayName(current)}`,
      detail: `Live lookup status changed from ${previous.status} to ${current.status}.`,
      eventKey: pairEventKey("observed_status_change", previous, current),
      identityId: current.identityId,
      catalogItemRawId: current.catalogItemRawId,
      metadata: pairMetadata(previous, current),
    });
  }

  if (
    previous.wholesalePriceGbp !== null &&
    current.wholesalePriceGbp !== null &&
    previous.wholesalePriceGbp !== current.wholesalePriceGbp
  ) {
    signals.push({
      type: "observed_price_change",
      severity: "info",
      score: 8,
      title: `Observed price change: ${itemDisplayName(current)}`,
      detail: `Observed wholesale price changed from GBP ${formatPrice(previous.wholesalePriceGbp)} to GBP ${formatPrice(current.wholesalePriceGbp)}.`,
      eventKey: pairEventKey("observed_price_change", previous, current),
      identityId: current.identityId,
      catalogItemRawId: current.catalogItemRawId,
      metadata: pairMetadata(previous, current),
    });
  }

  if (isFastMoverCandidate(previous, current, stockDrop, lowStockThreshold, fastMoverLookbackHours)) {
    signals.push({
      type: "fast_mover_candidate",
      severity: "watch",
      score: Math.min(100, Math.max(30, (stockDrop ?? lowStockThreshold) * 15)),
      title: `Fast mover candidate: ${itemDisplayName(current)}`,
      detail: buildFastMoverDetail(previous, current),
      eventKey: pairEventKey("fast_mover_candidate", previous, current),
      identityId: current.identityId,
      catalogItemRawId: current.catalogItemRawId,
      metadata: {
        ...pairMetadata(previous, current),
        stockDrop,
        elapsedHours: elapsedHours(previous.observedAt, current.observedAt),
        basis: "proxy candidate based only on observed stock or status changes",
      },
    });
  }

  return signals;
}

export function buildCurrentObservationSignalCandidates(
  current: MovementObservation,
  options: MovementSignalOptions = {},
): MovementSignalCandidate[] {
  const lowStockThreshold = options.lowStockThreshold ?? 3;
  if (current.status !== "in_stock" || current.stockQuantity === null || current.stockQuantity > lowStockThreshold) {
    return [];
  }
  return [
    {
      type: "observed_live_low_stock",
      severity: "warning",
      score: Math.max(1, lowStockThreshold + 1 - current.stockQuantity),
      title: `Low observed stock: ${itemDisplayName(current)}`,
      detail: `Live lookup observed ${current.stockQuantity} units in stock.`,
      eventKey: `live:observed_live_low_stock:${current.identityId}:${current.id}`,
      identityId: current.identityId,
      catalogItemRawId: current.catalogItemRawId,
      metadata: {
        observationId: current.id,
        junoId: current.junoId,
        status: current.status,
        stockQuantity: current.stockQuantity,
        displayStock: current.displayStock,
        lowStockThreshold,
        observedAt: current.observedAt,
      },
    },
  ];
}

function isObservedRestock(previous: MovementObservation, current: MovementObservation): boolean {
  const statusRestock = restockFromStatuses.has(previous.status) && restockToStatuses.has(current.status);
  const quantityRestock = (previous.stockQuantity === null || previous.stockQuantity === 0) && (current.stockQuantity ?? 0) > 0;
  return statusRestock || quantityRestock;
}

function getStockDrop(previous: MovementObservation, current: MovementObservation): number | null {
  if (previous.stockQuantity === null || current.stockQuantity === null) {
    return null;
  }
  const drop = previous.stockQuantity - current.stockQuantity;
  return drop > 0 ? drop : null;
}

function isFastMoverCandidate(
  previous: MovementObservation,
  current: MovementObservation,
  stockDrop: number | null,
  lowStockThreshold: number,
  lookbackHours: number,
): boolean {
  if (elapsedHours(previous.observedAt, current.observedAt) > lookbackHours) {
    return false;
  }
  const rapidStockDrop = stockDrop !== null && (stockDrop >= 3 || (current.stockQuantity ?? Number.POSITIVE_INFINITY) <= lowStockThreshold);
  const rapidStatusDrop = stockedStatuses.has(previous.status) && current.status === "out_of_stock";
  return rapidStockDrop || rapidStatusDrop;
}

function buildFastMoverDetail(previous: MovementObservation, current: MovementObservation): string {
  const hours = elapsedHours(previous.observedAt, current.observedAt);
  if (previous.stockQuantity !== null && current.stockQuantity !== null) {
    return `Fast mover candidate: observed live stock changed from ${previous.stockQuantity} to ${current.stockQuantity} within ${formatElapsedHours(hours)}. This is a proxy candidate based only on observed stock changes.`;
  }
  return `Fast mover candidate: observed live status changed from ${previous.status} to ${current.status} within ${formatElapsedHours(hours)}. This is a proxy candidate based only on observed status changes.`;
}

function pairEventKey(type: SignalEventType, previous: MovementObservation, current: MovementObservation): string {
  return `live:${type}:${current.identityId}:${previous.id}:${current.id}`;
}

function pairMetadata(previous: MovementObservation, current: MovementObservation): Record<string, unknown> {
  return {
    previousObservationId: previous.id,
    currentObservationId: current.id,
    junoId: current.junoId,
    previousStatus: previous.status,
    currentStatus: current.status,
    previousStockQuantity: previous.stockQuantity,
    currentStockQuantity: current.stockQuantity,
    previousDisplayStock: previous.displayStock,
    currentDisplayStock: current.displayStock,
    previousWholesalePriceGbp: previous.wholesalePriceGbp,
    currentWholesalePriceGbp: current.wholesalePriceGbp,
    previousObservedAt: previous.observedAt,
    currentObservedAt: current.observedAt,
  };
}

function elapsedHours(previousObservedAt: string, currentObservedAt: string): number {
  return Math.max(0, (new Date(currentObservedAt).getTime() - new Date(previousObservedAt).getTime()) / 3_600_000);
}

function itemDisplayName(observation: MovementObservation): string {
  const artist = observation.artist?.trim();
  const title = observation.title?.trim();
  if (artist && title) {
    return `${artist} - ${title}`;
  }
  return title || artist || observation.junoId || "Catalog item";
}

function formatPrice(value: number): string {
  return value.toFixed(2);
}

function formatElapsedHours(value: number): string {
  return `${Math.round(value)} hours`;
}
