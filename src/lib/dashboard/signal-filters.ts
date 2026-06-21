import {
  isDashboardMovementSignalType,
  isLowStockSignalType,
  signalEventTypes,
  signalSeverities,
  type SignalEventType,
  type SignalSeverity,
} from "@/lib/insights/signal-types";

export type DashboardSignalType = SignalEventType;
export type DashboardSignalSeverity = SignalSeverity;
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

export type FilterableDashboardNotificationDelivery = {
  signalType: DashboardSignalType | null;
  severity: DashboardSignalSeverity | null;
  queuedAt: string;
};

export const dashboardSignalTypes: DashboardSignalType[] = [...signalEventTypes];
export const dashboardSignalSeverities: DashboardSignalSeverity[] = [...signalSeverities];
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
    if (normalized.movementOnly && !isDashboardMovementSignalType(signal.type)) {
      return false;
    }
    if (fromDate && !isSignalOnOrAfter(signal.createdAt, fromDate)) {
      return false;
    }
    return true;
  });
}

export function filterDashboardNotificationDeliveries<T extends FilterableDashboardNotificationDelivery>(
  deliveries: T[],
  filters: DashboardSignalFilters,
  now: Date = new Date(),
): T[] {
  const normalized = normalizeDashboardSignalFilters(filters);
  const fromDate = getDateRangeStart(normalized.dateRange, now);
  const signalSpecificFilterActive = hasSignalSpecificDashboardFilters(normalized);

  return deliveries.filter((delivery) => {
    if (fromDate && !isSignalOnOrAfter(delivery.queuedAt, fromDate)) {
      return false;
    }
    if (!delivery.signalType || !delivery.severity) {
      return !signalSpecificFilterActive;
    }
    if (normalized.signalTypes.length > 0 && !normalized.signalTypes.includes(delivery.signalType)) {
      return false;
    }
    if (normalized.severities.length > 0 && !normalized.severities.includes(delivery.severity)) {
      return false;
    }
    if (normalized.watchHitsOnly && delivery.signalType !== "watch_hit") {
      return false;
    }
    if (normalized.lowStockOnly && !isLowStockSignalType(delivery.signalType)) {
      return false;
    }
    if (normalized.movementOnly && !isDashboardMovementSignalType(delivery.signalType)) {
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
    isLowStockSignalType(signal.type) ||
    (signal.item.stock !== null && signal.item.stock <= 3)
  );
}

function hasSignalSpecificDashboardFilters(filters: DashboardSignalFilters): boolean {
  return (
    filters.signalTypes.length > 0 ||
    filters.severities.length > 0 ||
    filters.watchHitsOnly ||
    filters.lowStockOnly ||
    filters.movementOnly
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
