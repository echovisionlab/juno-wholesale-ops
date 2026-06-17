import { describe, expect, it } from "vitest";
import { buildCatalogIdentityKey, normalizeCatalogText, normalizeIdentityInput } from "./normalize";

describe("catalog identity normalization", () => {
  it("normalizes text with unicode, ampersands, punctuation, and empty handling", () => {
    expect(normalizeCatalogText("  Café & Crème / 12\"  ")).toBe("cafe and creme 12");
    expect(normalizeCatalogText("")).toBeNull();
    expect(normalizeCatalogText(" -- ")).toBeNull();
    expect(normalizeCatalogText(null)).toBeNull();
    expect(normalizeCatalogText(undefined)).toBeNull();
  });

  it("builds identity keys using the configured priority order", () => {
    expect(
      buildCatalogIdentityKey({
        junoId: " JN-001 ",
        barcode: "123",
        artist: "Artist",
        title: "Title",
        label: "Label",
        catNo: "CAT",
      }),
    ).toBe("juno:jn 001");
    expect(buildCatalogIdentityKey({ barcode: " 123-456 ", label: "Label", catNo: "CAT" })).toBe("barcode:123 456");
    expect(buildCatalogIdentityKey({ label: "Blue & Red", catNo: " CAT-01 " })).toBe("cat:blue and red:cat 01");
    expect(buildCatalogIdentityKey({ artist: "A", title: "T", label: "L" })).toBe("text:a:t:l");
    expect(buildCatalogIdentityKey({ artist: "A", title: "T" })).toBeNull();
  });

  it("returns a typed normalized identity payload", () => {
    expect(
      normalizeIdentityInput({
        junoId: "J-1",
        barcode: "B-1",
        artist: "Björk",
        title: "Debut",
        label: "One Little Indian",
        catNo: "TPLP31",
      }),
    ).toEqual({
      junoId: "j 1",
      barcode: "b 1",
      artistNorm: "bjork",
      titleNorm: "debut",
      labelNorm: "one little indian",
      catNoNorm: "tplp31",
    });
  });
});
