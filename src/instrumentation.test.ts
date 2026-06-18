import { afterEach, describe, expect, it, vi } from "vitest";
import { register } from "./instrumentation";

describe("instrumentation register", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("skips non-Node runtimes", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");

    await expect(register()).resolves.toBeUndefined();
  });

  it("fails Node runtime registration when required env is missing", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("DATABASE_URL", "");

    await expect(register()).rejects.toThrow();
  });
});
