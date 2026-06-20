export type DashboardSignalType =
  | "new_arrival"
  | "watch_hit"
  | "low_catalog_stock"
  | "exclude_match"
  | "observed_restock"
  | "observed_stock_drop"
  | "observed_live_low_stock"
  | "observed_status_change"
  | "observed_price_change"
  | "fast_mover_candidate"
  | "trend_spike";

export type DashboardSignalSeverity = "info" | "watch" | "warning" | "critical";
export type DashboardDateRange = "today" | "7d" | "30d" | "all";

export type DashboardSignalFilters = {
  signalTypes: DashboardSignalType[];
  severities: DashboardSignalSeverity[];
  watchHitsOnly: boolean;
  lowStockOnly: boolean;
  movementOnly: boolean;
  dateRange: DashboardDateRange;
};

export type FilterableDashboardSignal = {
  type: DashboardSignalType;
  severity: DashboardSignalSeverity;
  createdAt: string;
  item: {
    stock: number | null;
  };
};

export const dashboardSignalTypes: DashboardSignalType[] = [
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
];

export const dashboardSignalSeverities: DashboardSignalSeverity[] = ["info", "watch", "warning", "critical"];
export const dashboardDateRanges: DashboardDateRange[] = ["today", "7d", "30d", "all"];

export const defaultDashboardSignalFilters: DashboardSignalFilters = {
  signalTypes: [],
  severities: [],
  watchHitsOnly: false,
  lowStockOnly: false,
  movementOnly: false,
  dateRange: "all",
};

const signalTypeSet = new Set(dashboardSignalTypes);
const severitySet = new Set(dashboardSignalSeverities);
const dateRangeSet = new Set(dashboardDateRanges);
const movementSignalTypeSet = new Set<DashboardSignalType>([
  "observed_restock",
  "observed_stock_drop",
  "observed_live_low_stock",
  "observed_status_change",
  "observed_price_change",
  "fast_mover_candidate",
  "trend_spike",
]);

export function normalizeDashboardSignalFilters(value: unknown): DashboardSignalFilters {
  if (!isRecord(value)) {
    return { ...defaultDashboardSignalFilters };
  }

  const dateRange = typeof value.dateRange === "string" && dateRangeSet.has(value.dateRange as DashboardDateRange)
    ? (value.dateRange as DashboardDateRange)
    : defaultDashboardSignalFilters.dateRange;

  return {
    signalTypes: uniqueKnownValues(value.signalTypes, signalTypeSet),
    severities: uniqueKnownValues(value.severities, severitySet),
    watchHitsOnly: value.watchHitsOnly === true,
    lowStockOnly: value.lowStockOnly === true,
    movementOnly: value.movementOnly === true,
    dateRange,
  };
}

export function filterDashboardSignals<T extends FilterableDashboardSignal>(
  signals: T[],
  filters: DashboardSignalFilters,
  now: Date = new Date(),
): T[] {
  const normalized = normalizeDashboardSignalFilters(filters);
  const fromDate = getDateRangeStart(normalized.dateRange, now);

  return signals.filter((signal) => {
    if (normalized.signalTypes.length > 0 && !normalized.signalTypes.includes(signal.type)) {
      return false;
    }
    if (normalized.severities.length > 0 && !normalized.severities.includes(signal.severity)) {
      return false;
    }
    if (normalized.watchHitsOnly && signal.type !== "watch_hit") {
      return false;
    }
    if (normalized.lowStockOnly && !isLowStockSignal(signal)) {
      return false;
    }
    if (normalized.movementOnly && !movementSignalTypeSet.has(signal.type)) {
      return false;
    }
    if (fromDate && !isSignalOnOrAfter(signal.createdAt, fromDate)) {
      return false;
    }
    return true;
  });
}

export function hasActiveDashboardSignalFilters(filters: DashboardSignalFilters): boolean {
  const normalized = normalizeDashboardSignalFilters(filters);
  return (
    normalized.signalTypes.length > 0 ||
    normalized.severities.length > 0 ||
    normalized.watchHitsOnly ||
    normalized.lowStockOnly ||
    normalized.movementOnly ||
    normalized.dateRange !== "all"
  );
}

export function formatDashboardDateRange(value: DashboardDateRange): string {
  if (value === "today") {
    return "Today";
  }
  if (value === "7d") {
    return "Last 7 days";
  }
  if (value === "30d") {
    return "Last 30 days";
  }
  return "All dates";
}

function uniqueKnownValues<T extends string>(value: unknown, allowed: Set<T>): T[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.filter((entry): entry is T => typeof entry === "string" && allowed.has(entry as T)))];
}

function isLowStockSignal(signal: FilterableDashboardSignal): boolean {
  return (
    signal.type === "low_catalog_stock" ||
    signal.type === "observed_live_low_stock" ||
    (signal.item.stock !== null && signal.item.stock <= 3)
  );
}

function getDateRangeStart(range: DashboardDateRange, now: Date): Date | null {
  if (range === "all") {
    return null;
  }
  if (range === "today") {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }
  const days = range === "7d" ? 7 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function isSignalOnOrAfter(value: string, fromDate: Date): boolean {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.getTime() >= fromDate.getTime();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
