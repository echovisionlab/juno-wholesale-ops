import { describe, expect, it } from "vitest";
import { getRequestOrigin } from "./request-origin";

describe("getRequestOrigin", () => {
  it("uses forwarded proto and host when present", () => {
    const request = new Request("http://localhost:3006/settings", {
      headers: {
        "x-forwarded-proto": "https",
        "x-forwarded-host": "inventory-dev.dsub.io",
      },
    });

    expect(getRequestOrigin(request)).toBe("https://inventory-dev.dsub.io");
  });

  it("uses the request URL and host header when forwarded headers are absent", () => {
    const request = new Request("http://localhost:3006/settings", {
      headers: { host: "localhost:3006" },
    });

    expect(getRequestOrigin(request)).toBe("http://localhost:3006");
  });
});
