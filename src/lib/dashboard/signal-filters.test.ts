import { describe, expect, it } from "vitest";
import {
  defaultDashboardSignalFilters,
  filterDashboardNotificationDeliveries,
  filterDashboardSignals,
  hasActiveDashboardSignalFilters,
  normalizeDashboardSignalFilters,
  type FilterableDashboardNotificationDelivery,
  type FilterableDashboardSignal,
} from "./signal-filters";

describe("dashboard signal filters", () => {
  const now = new Date("2026-06-20T12:00:00.000Z");
  const signals: FilterableDashboardSignal[] = [
    signal("watch_hit", "watch", "2026-06-20T08:00:00.000Z", 5),
    signal("low_catalog_stock", "warning", "2026-06-19T08:00:00.000Z", 2),
    signal("observed_stock_drop", "warning", "2026-06-15T08:00:00.000Z", 4),
    signal("trend_spike", "info", "2026-05-01T08:00:00.000Z", null),
  ];
  const deliveries: FilterableDashboardNotificationDelivery[] = [
    delivery("watch_hit", "watch", "2026-06-20T08:00:00.000Z"),
    delivery("low_catalog_stock", "warning", "2026-06-19T08:00:00.000Z"),
    delivery("observed_stock_drop", "warning", "2026-06-15T08:00:00.000Z"),
    delivery(null, null, "2026-06-20T09:00:00.000Z"),
  ];

  it("normalizes only supported filter keys and values", () => {
    expect(
      normalizeDashboardSignalFilters({
        signalTypes: ["watch_hit", "unknown", "watch_hit"],
        severities: ["warning", "bad"],
        watchHitsOnly: true,
        lowStockOnly: "yes",
        movementOnly: true,
        dateRange: "7d",
        unsafe: "ignored",
      }),
    ).toEqual({
      signalTypes: ["watch_hit"],
      severities: ["warning"],
      watchHitsOnly: true,
      lowStockOnly: false,
      movementOnly: true,
      dateRange: "7d",
    });
    expect(normalizeDashboardSignalFilters(null)).toEqual(defaultDashboardSignalFilters);
  });

  it("filters by type, severity, watch hits, low stock, movement, and date range", () => {
    expect(filterDashboardSignals(signals, { ...defaultDashboardSignalFilters, signalTypes: ["watch_hit"] }, now)).toEqual([
      signals[0],
    ]);
    expect(filterDashboardSignals(signals, { ...defaultDashboardSignalFilters, severities: ["warning"] }, now)).toEqual([
      signals[1],
      signals[2],
    ]);
    expect(filterDashboardSignals(signals, { ...defaultDashboardSignalFilters, watchHitsOnly: true }, now)).toEqual([
      signals[0],
    ]);
    expect(filterDashboardSignals(signals, { ...defaultDashboardSignalFilters, lowStockOnly: true }, now)).toEqual([
      signals[1],
    ]);
    expect(filterDashboardSignals(signals, { ...defaultDashboardSignalFilters, movementOnly: true }, now)).toEqual([
      signals[2],
      signals[3],
    ]);
    expect(filterDashboardSignals(signals, { ...defaultDashboardSignalFilters, dateRange: "today" }, now)).toEqual([
      signals[0],
    ]);
    expect(filterDashboardSignals(signals, { ...defaultDashboardSignalFilters, dateRange: "7d" }, now)).toEqual([
      signals[0],
      signals[1],
      signals[2],
    ]);
  });

  it("filters notification deliveries by signal fields while preserving digest rows for date-only filters", () => {
    expect(filterDashboardNotificationDeliveries(deliveries, { ...defaultDashboardSignalFilters, signalTypes: ["watch_hit"] }, now)).toEqual([
      deliveries[0],
    ]);
    expect(filterDashboardNotificationDeliveries(deliveries, { ...defaultDashboardSignalFilters, severities: ["warning"] }, now)).toEqual([
      deliveries[1],
      deliveries[2],
    ]);
    expect(filterDashboardNotificationDeliveries(deliveries, { ...defaultDashboardSignalFilters, watchHitsOnly: true }, now)).toEqual([
      deliveries[0],
    ]);
    expect(filterDashboardNotificationDeliveries(deliveries, { ...defaultDashboardSignalFilters, lowStockOnly: true }, now)).toEqual([
      deliveries[1],
    ]);
    expect(filterDashboardNotificationDeliveries(deliveries, { ...defaultDashboardSignalFilters, movementOnly: true }, now)).toEqual([
      deliveries[2],
    ]);
    expect(filterDashboardNotificationDeliveries(deliveries, { ...defaultDashboardSignalFilters, dateRange: "today" }, now)).toEqual([
      deliveries[0],
      deliveries[3],
    ]);
  });

  it("reports active filter state", () => {
    expect(hasActiveDashboardSignalFilters(defaultDashboardSignalFilters)).toBe(false);
    expect(hasActiveDashboardSignalFilters({ ...defaultDashboardSignalFilters, dateRange: "today" })).toBe(true);
    expect(hasActiveDashboardSignalFilters({ ...defaultDashboardSignalFilters, signalTypes: ["watch_hit"] })).toBe(true);
  });
});

function signal(
  type: FilterableDashboardSignal["type"],
  severity: FilterableDashboardSignal["severity"],
  createdAt: string,
  stock: number | null,
): FilterableDashboardSignal {
  return {
    type,
    severity,
    createdAt,
    item: { stock },
  };
}

function delivery(
  signalType: FilterableDashboardNotificationDelivery["signalType"],
  severity: FilterableDashboardNotificationDelivery["severity"],
  queuedAt: string,
): FilterableDashboardNotificationDelivery {
  return {
    signalType,
    severity,
    queuedAt,
  };
}
