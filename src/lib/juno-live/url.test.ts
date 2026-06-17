import { describe, expect, it } from "vitest";
import { buildJunoProductUrl, normalizeJunoId } from "./url";

describe("Juno product URL helpers", () => {
  it("normalizes Juno IDs and builds id-only product URLs", () => {
    expect(normalizeJunoId(" 1148569-01 ")).toBe("1148569-01");
    expect(buildJunoProductUrl("1148569-01")).toBe("https://www.juno.co.uk/products/1148569-01/");
    expect(buildJunoProductUrl("1148569-01", "https://example.test/base")).toBe(
      "https://example.test/products/1148569-01/",
    );
  });

  it("rejects invalid Juno IDs", () => {
    expect(() => normalizeJunoId("abc")).toThrow("Invalid Juno ID");
  });
});
