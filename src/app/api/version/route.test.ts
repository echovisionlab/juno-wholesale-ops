import { describe, expect, it } from "vitest";
import packageJson from "../../../../package.json";
import { GET } from "./route";

describe("GET /api/version", () => {
  it("returns minimal public version metadata", async () => {
    const payload = await GET().json();

    expect(payload).toMatchObject({ status: "ok", version: packageJson.version });
    expect(Object.keys(payload).sort()).toEqual(["gitSha", "status", "version"]);
    expect(payload).not.toHaveProperty("buildTime");
    expect(payload).not.toHaveProperty("environment");
  });
});
