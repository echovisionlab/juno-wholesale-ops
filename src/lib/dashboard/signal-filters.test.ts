import { describe, expect, it } from "vitest";
import {
  defaultDashboardSignalFilters,
  filterDashboardSignals,
  hasActiveDashboardSignalFilters,
  normalizeDashboardSignalFilters,
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
