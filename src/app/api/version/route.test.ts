import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/version", () => {
  it("returns minimal public version metadata", async () => {
    const payload = await GET().json();

    expect(payload).toMatchObject({ status: "ok", version: "0.6.0" });
    expect(Object.keys(payload).sort()).toEqual(["gitSha", "status", "version"]);
    expect(payload).not.toHaveProperty("buildTime");
    expect(payload).not.toHaveProperty("environment");
  });
});
