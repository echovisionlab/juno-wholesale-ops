import { describe, expect, it } from "vitest";
import {
  buildCurrentObservationSignalCandidates,
  buildMovementSignalCandidates,
  type MovementObservation,
} from "./movement";

describe("movement signal detection", () => {
  it("detects restock, stock drop, low stock, status change, price change, and fast mover candidates", () => {
    const previous = observation({
      id: "obs-1",
      status: "out_of_stock",
      stockQuantity: 8,
      wholesalePriceGbp: 10.5,
      observedAt: "2026-06-17T00:00:00.000Z",
    });
    const current = observation({
      id: "obs-2",
      status: "in_stock",
      stockQuantity: 2,
      wholesalePriceGbp: 11.25,
      observedAt: "2026-06-17T18:00:00.000Z",
    });

    const signals = buildMovementSignalCandidates(previous, current, { lowStockThreshold: 3 });

    expect(signals.map((signal) => signal.type)).toEqual([
      "observed_live_low_stock",
      "observed_restock",
      "observed_stock_drop",
      "observed_status_change",
      "observed_price_change",
      "fast_mover_candidate",
    ]);
    expect(signals.find((signal) => signal.type === "observed_stock_drop")).toMatchObject({
      score: 60,
      detail: "Observed live stock changed from 8 to 2.",
      eventKey: "live:observed_stock_drop:identity-1:obs-1:obs-2",
    });
    expect(signals.find((signal) => signal.type === "fast_mover_candidate")?.detail).toContain(
      "proxy candidate based only on observed stock changes",
    );
  });

  it("uses status movement as a fast mover proxy when quantities are unavailable", () => {
    const signals = buildMovementSignalCandidates(
      observation({ status: "preorder", stockQuantity: null, observedAt: "2026-06-17T00:00:00.000Z" }),
      observation({ id: "obs-3", status: "out_of_stock", stockQuantity: null, observedAt: "2026-06-17T05:00:00.000Z" }),
    );

    expect(signals.map((signal) => signal.type)).toEqual(["observed_status_change", "fast_mover_candidate"]);
    expect(signals.find((signal) => signal.type === "fast_mover_candidate")?.detail).toContain(
      "proxy candidate based only on observed status changes",
    );
  });

  it("does not mark slow or high-stock changes as low stock or fast mover candidates", () => {
    const signals = buildMovementSignalCandidates(
      observation({ id: "obs-4", stockQuantity: 8, observedAt: "2026-06-15T00:00:00.000Z" }),
      observation({ id: "obs-5", stockQuantity: 6, observedAt: "2026-06-18T00:00:00.000Z" }),
    );
    const currentOnly = buildCurrentObservationSignalCandidates(
      observation({ id: "obs-6", status: "in_stock", stockQuantity: 4 }),
      { lowStockThreshold: 3 },
    );

    expect(signals.map((signal) => signal.type)).toEqual(["observed_stock_drop"]);
    expect(currentOnly).toEqual([]);
  });

  it("detects quantity restock without a status transition", () => {
    const signals = buildMovementSignalCandidates(
      observation({ id: "obs-7", status: "unknown", stockQuantity: null }),
      observation({ id: "obs-8", status: "unknown", stockQuantity: 4 }),
    );

    expect(signals.map((signal) => signal.type)).toEqual(["observed_restock"]);
  });

  it("covers restock, drop, and fast mover threshold edge cases", () => {
    expect(
      buildMovementSignalCandidates(
        observation({ id: "obs-12", status: "out_of_stock", stockQuantity: 0 }),
        observation({ id: "obs-13", status: "preorder", stockQuantity: null }),
      ).find((signal) => signal.type === "observed_restock"),
    ).toMatchObject({ score: 20 });
    expect(
      buildMovementSignalCandidates(
        observation({ id: "obs-14", status: "in_stock", stockQuantity: 3 }),
        observation({ id: "obs-15", status: "in_stock", stockQuantity: 5 }),
      ),
    ).toEqual([]);
    expect(
      buildMovementSignalCandidates(
        observation({ id: "obs-16", status: "in_stock", stockQuantity: 4 }),
        observation({ id: "obs-17", status: "in_stock", stockQuantity: 2 }),
      ).map((signal) => signal.type),
    ).toEqual(["observed_live_low_stock", "observed_stock_drop", "fast_mover_candidate"]);
  });

  it("uses stable item display fallbacks for sparse observations", () => {
    expect(
      buildCurrentObservationSignalCandidates(
        observation({ id: "obs-9", artist: null, title: "Title Only", stockQuantity: 1 }),
      )[0].title,
    ).toBe("Low observed stock: Title Only");
    expect(
      buildCurrentObservationSignalCandidates(
        observation({ id: "obs-10", artist: null, title: null, junoId: "fallback-juno", stockQuantity: 1 }),
      )[0].title,
    ).toBe("Low observed stock: fallback-juno");
    expect(
      buildCurrentObservationSignalCandidates(
        observation({ id: "obs-11", artist: null, title: null, junoId: null, stockQuantity: 1 }),
      )[0].title,
    ).toBe("Low observed stock: Catalog item");
  });
});

function observation(overrides: Partial<MovementObservation>): MovementObservation {
  return {
    id: "obs-1",
    identityId: "identity-1",
    catalogItemRawId: "raw-1",
    junoId: "1148569-01",
    status: "in_stock",
    stockQuantity: 5,
    displayStock: "5 in stock",
    wholesalePriceGbp: 10,
    observedAt: "2026-06-17T00:00:00.000Z",
    artist: "Lara Voss",
    title: "Signal Path",
    label: "Blue Note",
    ...overrides,
  };
}
