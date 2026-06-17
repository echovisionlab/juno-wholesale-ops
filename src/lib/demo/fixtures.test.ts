import { describe, expect, it } from "vitest";
import {
  assertSyntheticDemoCatalogFixtures,
  loadDemoCatalogFixtures,
  validateSyntheticDemoCatalogFixtures,
  type DemoCatalogFixture,
} from "./fixtures";

describe("demo fixtures", () => {
  it("loads only synthetic XLSX fixture rows", async () => {
    const fixtures = await loadDemoCatalogFixtures();

    expect(fixtures).toHaveLength(2);
    expect(validateSyntheticDemoCatalogFixtures(fixtures)).toEqual([]);
    expect(fixtures.map((fixture) => fixture.catalog.rowCount)).toEqual([2, 6]);
    expect(
      fixtures.flatMap((fixture) => fixture.catalog.items.map((item) => item.junoId)),
    ).toEqual(expect.arrayContaining(["demo-1001", "demo-2001"]));
    expect(() => assertSyntheticDemoCatalogFixtures(fixtures)).not.toThrow();
  });

  it("rejects empty or real-looking fixture values", () => {
    const unsafe = fixture({
      rowCount: 1,
      items: [
        {
          rowNumber: 2,
          junoId: "1148569",
          artist: "Realistic Artist",
          title: "Realistic Title",
          label: "Realistic Label",
          catNo: "ABC123",
          barcode: "1234567890123",
          medium: "LP",
          description: "Realistic Description",
          genre: "House",
          dealerExVatText: "9.99",
          dealerPriceGbp: 9.99,
          releaseDate: "2026-06-18",
          stock: 1,
          maxOrder: 1,
          raw: {
            Artist: "Realistic Artist",
            Label: "Realistic Label",
            Empty: "",
            Count: 1,
            Notes: "contact ops@example.test and see https://hooks.example.test/path",
            Key: `-----BEGIN ${"PRIVATE"} KEY-----`,
          },
        },
      ],
    });
    const empty = fixture({ rowCount: 0, items: [] });
    const issues = validateSyntheticDemoCatalogFixtures([unsafe, empty]);

    expect(issues.map((issue) => issue.message)).toEqual(expect.arrayContaining([
      "demo Juno IDs must use the demo- prefix",
      "demo catalog numbers must use the DEMO- prefix",
      "demo barcodes must stay in the reserved 000000xxxxxx range",
      "demo fixtures must not contain email addresses",
      "demo fixtures must not contain real URLs",
      "demo fixtures must not contain private keys",
      "demo artist, label, and title values must be visibly synthetic",
      "fixture must include at least one catalog row",
    ]));
    expect(() => assertSyntheticDemoCatalogFixtures([unsafe])).toThrow("Demo fixture safety check failed");
    expect(() => assertSyntheticDemoCatalogFixtures([empty])).toThrow("demo/fixtures/catalog/preorders-demo.xlsx: fixture");
  });
});

function fixture(catalog: Partial<DemoCatalogFixture["catalog"]>): DemoCatalogFixture {
  return {
    relativePath: "demo/fixtures/catalog/preorders-demo.xlsx",
    filename: "preorders-demo.xlsx",
    sha256: "demo-sha",
    bytes: Buffer.from("demo"),
    catalog: {
      kind: "preorder",
      sheetName: "Synthetic Demo",
      catalogDate: "2026-06-18",
      contentHash: "demo-content",
      rowCount: catalog.rowCount ?? 0,
      items: [],
      ...catalog,
    },
  };
}
