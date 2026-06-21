import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/health", () => {
  it("returns only health status", async () => {
    await expect(GET().json()).resolves.toEqual({ status: "ok" });
  });
});
