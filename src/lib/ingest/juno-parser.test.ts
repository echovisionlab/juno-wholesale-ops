import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseJunoCatalog, parseJunoWorkbook } from "./juno-parser";

describe("parseJunoCatalog", () => {
  it("normalizes preorder workbooks and computes deterministic content hashes", () => {
    const buffer = workbookBuffer("Preorders", [
      {
        Artist: "Artist A",
        Title: "Album A",
        "Juno ID": "100-01",
        Label: "Label A",
        "Cat No": "CAT001",
        Barcode: "123456",
        Medium: "Vinyl",
        Description: "gatefold 180 gram vinyl 2xLP",
        Genre: "Rock",
        "Dealer Ex VAT": "£35.44",
        "Antic Rel Date": "2026-07-24",
        "Max Order": "7",
      },
      {
        Artist: " ",
        Title: "",
        "Dealer Ex VAT": "not a price",
      },
    ]);

    const first = parseJunoCatalog(buffer, "Juno Wholesale New Preorders 16 June 2026.xlsx");
    const second = parseJunoCatalog(buffer, " Juno  Wholesale  New Preorders 16 June 2026.xlsx ");
    const resentWithDifferentName = parseJunoCatalog(buffer, "Juno Wholesale New Preorders 17 June 2026.xlsx");

    expect(first.kind).toBe("preorder");
    expect(first.sheetName).toBe("Preorders");
    expect(first.catalogDate).toBe("2026-06-16");
    expect(first.rowCount).toBe(1);
    expect(first.contentHash).toBe(second.contentHash);
    expect(first.contentHash).toBe(resentWithDifferentName.contentHash);
    expect(first.items[0]).toMatchObject({
      rowNumber: 2,
      junoId: "100-01",
      artist: "Artist A",
      title: "Album A",
      label: "Label A",
      catNo: "CAT001",
      barcode: "123456",
      medium: "Vinyl",
      description: "gatefold 180 gram vinyl 2xLP",
      genre: "Rock",
      dealerExVatText: "£35.44",
      dealerPriceGbp: 35.44,
      releaseDate: "2026-07-24",
      maxOrder: 7,
      stock: null,
    });
  });

  it("normalizes in-stock workbooks to source catalog fields only", () => {
    const parsed = parseJunoCatalog(
      workbookBuffer("Stock", [
        row("Vinyl", '7"', "£6.19", "45"),
        row("Vinyl", "3xLP in debossed sleeve", "£30.74", "25"),
        row("CD", "3CD box set", "£18.94", "2"),
        row("CD", "CD", "£9.94", "1"),
        row("Misc", "poster", "£12.00", "bad stock"),
        row("Vinyl", "double vinyl LP", "£20.00", ""),
        row("Vinyl", "2LP", "£21.00", null),
        row("Vinyl", "2 x vinyl", "£22.00", undefined),
        row("Vinyl", "standard LP", "£17.00", "3"),
      ]),
      "Juno Wholesale New Releases In Stock 15 September 2026.xlsx",
    );

    expect(parsed.kind).toBe("in_stock");
    expect(parsed.catalogDate).toBe("2026-09-15");
    expect(parsed.items.map((item) => [item.medium, item.description, item.stock])).toEqual([
      ["Vinyl", '7"', 45],
      ["Vinyl", "3xLP in debossed sleeve", 25],
      ["CD", "3CD box set", 2],
      ["CD", "CD", 1],
      ["Misc", "poster", null],
      ["Vinyl", "double vinyl LP", null],
      ["Vinyl", "2LP", null],
      ["Vinyl", "2 x vinyl", null],
      ["Vinyl", "standard LP", 3],
    ]);
  });

  it("handles unknown catalog shape, invalid dates, invalid prices, and missing date in filename", () => {
    const parsed = parseJunoCatalog(
      workbookBuffer("Other", [
        {
          Artist: "Artist B",
          Title: "Album B",
          Medium: "Vinyl",
          Description: "picture disc",
          "Dealer Ex VAT": "free",
        },
      ]),
      "Wholesale Upload Foo 2026.xlsx",
    );

    expect(parsed.kind).toBe("unknown");
    expect(parsed.catalogDate).toBeNull();
    expect(parsed.items[0]).toMatchObject({
      dealerPriceGbp: null,
      releaseDate: null,
      stock: null,
    });
  });

  it("returns null when the filename contains an unrecognized month name", () => {
    const parsed = parseJunoCatalog(
      workbookBuffer("Other", [{ Artist: "Artist Z", Title: "Album Z" }]),
      "Wholesale Upload 15 Foo 2026.xlsx",
    );

    expect(parsed.catalogDate).toBeNull();
  });

  it("returns an empty unknown catalog for empty sheets", () => {
    const parsed = parseJunoCatalog(workbookBuffer("Empty", []), "Manual Upload.xlsx");

    expect(parsed.kind).toBe("unknown");
    expect(parsed.catalogDate).toBeNull();
    expect(parsed.rowCount).toBe(0);
    expect(parsed.items).toEqual([]);
  });

  it("rejects workbooks without sheets", () => {
    expect(() => parseJunoWorkbook({ SheetNames: [], Sheets: {} }, "empty.xlsx")).toThrow(
      "Workbook has no sheets: empty.xlsx",
    );
  });

  it("returns null for invalid release dates in preorder sheets", () => {
    const parsed = parseJunoCatalog(
      workbookBuffer("Preorder", [
        {
          Artist: "Artist C",
          Title: "Album C",
          "Juno ID": "bad-date",
          Medium: "CD",
          Description: "CD",
          "Dealer Ex VAT": "£10",
          "Antic Rel Date": "not a date",
        },
      ]),
      "Juno Wholesale New Preorders 01 June 2026.xlsx",
    );

    expect(parsed.kind).toBe("preorder");
    expect(parsed.items[0].releaseDate).toBeNull();
  });
});

function row(medium: string, description: string, price: string, stock: unknown) {
  return {
    Artist: `${medium} ${description}`,
    Title: "Title",
    "Juno ID": `${medium}-${description}`,
    Medium: medium,
    Description: description,
    Genre: "Genre",
    "Dealer Ex VAT": price,
    Stock: stock,
  };
}

function workbookBuffer(sheetName: string, rows: Array<Record<string, unknown>>) {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
