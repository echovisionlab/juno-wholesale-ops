import { describe, expect, it } from "vitest";
import { clampLiveConcurrency, createSeededRandom, getJitterDelayMs } from "./delay";

describe("Juno live delay helpers", () => {
  it("creates deterministic jitter inside the configured range", () => {
    const random = createSeededRandom(123);

    expect(getJitterDelayMs({ minMs: 10, maxMs: 20, random })).toBe(13);
    expect(getJitterDelayMs({ minMs: 10, maxMs: 20, random })).toBe(14);
  });

  it("allows fixed delays and rejects inverted ranges", () => {
    expect(getJitterDelayMs({ minMs: 7, maxMs: 7, random: () => 0.99 })).toBe(7);
    expect(() => getJitterDelayMs({ minMs: 20, maxMs: 10 })).toThrow(
      "Delay minMs must be less than or equal to maxMs",
    );
  });

  it("clamps concurrency to the worker limits", () => {
    expect(clampLiveConcurrency(Number.NaN)).toBe(1);
    expect(clampLiveConcurrency(0)).toBe(1);
    expect(clampLiveConcurrency(4.9)).toBe(4);
    expect(clampLiveConcurrency(20)).toBe(10);
  });
});
