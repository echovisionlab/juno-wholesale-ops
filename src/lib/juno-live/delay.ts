export type RandomSource = () => number;

export type DelayOptions = {
  minMs: number;
  maxMs: number;
  random?: RandomSource;
};

export function createSeededRandom(seed: number): RandomSource {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function getJitterDelayMs(options: DelayOptions): number {
  if (options.minMs > options.maxMs) {
    throw new Error("Delay minMs must be less than or equal to maxMs");
  }
  const random = options.random ?? Math.random;
  const span = options.maxMs - options.minMs;
  return options.minMs + Math.floor(random() * (span + 1));
}

export function clampLiveConcurrency(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(1, Math.min(10, Math.trunc(value)));
}
