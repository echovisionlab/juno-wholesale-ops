export const signalEventTypes = [
  "new_arrival",
  "watch_hit",
  "low_catalog_stock",
  "exclude_match",
  "observed_restock",
  "observed_stock_drop",
  "observed_live_low_stock",
  "observed_status_change",
  "observed_price_change",
  "fast_mover_candidate",
  "trend_spike",
] as const;

export type SignalEventType = (typeof signalEventTypes)[number];

export const signalSeverities = ["info", "watch", "warning", "critical"] as const;

export type SignalSeverity = (typeof signalSeverities)[number];

export const liveMovementSignalTypes = [
  "observed_restock",
  "observed_stock_drop",
  "observed_live_low_stock",
  "observed_status_change",
  "observed_price_change",
  "fast_mover_candidate",
] as const satisfies SignalEventType[];

const dashboardMovementSignalTypes = [...liveMovementSignalTypes, "trend_spike"] as const satisfies SignalEventType[];

const lowStockSignalTypes = [
  "low_catalog_stock",
  "observed_live_low_stock",
] as const satisfies SignalEventType[];

export const signalTypeLabels: Record<SignalEventType, string> = {
  new_arrival: "New arrival",
  watch_hit: "Watch hit",
  low_catalog_stock: "Low observed stock",
  exclude_match: "Exclude match",
  observed_restock: "Observed restock",
  observed_stock_drop: "Observed stock change",
  observed_live_low_stock: "Low live stock",
  observed_status_change: "Observed status change",
  observed_price_change: "Observed price change",
  fast_mover_candidate: "Fast mover candidate",
  trend_spike: "Catalog trend spike",
};

export const signalSeverityLabels: Record<SignalSeverity, string> = {
  info: "Info",
  watch: "Watch",
  warning: "Warning",
  critical: "Critical",
};

const dashboardMovementSignalTypeSet = new Set<SignalEventType>(dashboardMovementSignalTypes);
const lowStockSignalTypeSet = new Set<SignalEventType>(lowStockSignalTypes);

export function isDashboardMovementSignalType(type: SignalEventType): boolean {
  return dashboardMovementSignalTypeSet.has(type);
}

export function isLowStockSignalType(type: SignalEventType): boolean {
  return lowStockSignalTypeSet.has(type);
}
