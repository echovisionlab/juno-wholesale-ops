import { describe, expect, it } from "vitest";
import writeXlsxFile, { type Sheet, type SheetData } from "write-excel-file/node";
import {
  maxJunoWorkbookBytes,
  maxJunoWorkbookRows,
  parseJunoCatalog,
  parseJunoWorkbook,
} from "./juno-parser";

describe("parseJunoCatalog", () => {
  it("normalizes preorder workbooks and computes deterministic content hashes", async () => {
    const buffer = await workbookBuffer("Preorders", [
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

    const first = await parseJunoCatalog(buffer, "Juno Wholesale New Preorders 16 June 2026.xlsx");
    const second = await parseJunoCatalog(buffer, " Juno  Wholesale  New Preorders 16 June 2026.xlsx ");
    const resentWithDifferentName = await parseJunoCatalog(buffer, "Juno Wholesale New Preorders 17 June 2026.xlsx");

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

  it("normalizes in-stock workbooks to source catalog fields only", async () => {
    const parsed = await parseJunoCatalog(
      await workbookBuffer("Stock", [
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

  it("handles unknown catalog shape, invalid dates, invalid prices, and missing date in filename", async () => {
    const parsed = await parseJunoCatalog(
      await workbookBuffer("Other", [
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

  it("returns null when the filename contains an unrecognized month name", async () => {
    const parsed = await parseJunoCatalog(
      await workbookBuffer("Other", [{ Artist: "Artist Z", Title: "Album Z" }]),
      "Wholesale Upload 15 Foo 2026.xlsx",
    );

    expect(parsed.catalogDate).toBeNull();
  });

  it("returns an empty unknown catalog for empty sheets", async () => {
    const parsed = await parseJunoCatalog(await workbookBuffer("Empty", []), "Manual Upload.xlsx");

    expect(parsed.kind).toBe("unknown");
    expect(parsed.catalogDate).toBeNull();
    expect(parsed.rowCount).toBe(0);
    expect(parsed.items).toEqual([]);
  });

  it("rejects workbooks without sheets", () => {
    expect(() => parseJunoWorkbook({ sheets: [] }, "empty.xlsx")).toThrow("Workbook has no sheets: empty.xlsx");
  });

  it("rejects workbooks above the byte limit before parsing", async () => {
    await expect(parseJunoCatalog(Buffer.alloc(maxJunoWorkbookBytes + 1), "too-large.xlsx")).rejects.toThrow(
      `Workbook exceeds ${maxJunoWorkbookBytes} byte limit: too-large.xlsx`,
    );
  });

  it("rejects sheets above the row limit", () => {
    const rows = Array.from({ length: maxJunoWorkbookRows + 1 }, (_, index) => ({
      Artist: `Demo Artist ${index}`,
      Title: `Demo Title ${index}`,
    }));

    expect(() => parseJunoWorkbook({ sheets: [{ sheetName: "Rows", rows: rowsToWorkbookRows(rows) }] }, "rows.xlsx"))
      .toThrow(`Workbook exceeds ${maxJunoWorkbookRows} row limit: rows.xlsx`);
  });

  it("reads only the first sheet", async () => {
    const parsed = await parseJunoCatalog(
      await workbookBuffer(
        "First",
        [{ Artist: "First Artist", Title: "First Title", "Juno ID": "first-1" }],
        [{ sheetName: "Second", rows: [{ Artist: "Second Artist", Title: "Second Title", "Juno ID": "second-1" }] }],
      ),
      "Manual Upload.xlsx",
    );

    expect(parsed.sheetName).toBe("First");
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]).toMatchObject({ junoId: "first-1", artist: "First Artist" });
  });

  it("returns null for invalid release dates in preorder sheets", async () => {
    const parsed = await parseJunoCatalog(
      await workbookBuffer("Preorder", [
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

  it("normalizes date cells and rejects invalid date objects", () => {
    const parsed = parseJunoWorkbook(
      {
        sheets: [
          {
            sheetName: "Preorder Dates",
            rows: [
              ["Artist", "Title", "Juno ID", "Antic Rel Date"],
              ["Date Artist", "Date Title", "date-1", new Date("2026-07-24T00:00:00.000Z")],
              ["Bad Date Artist", "Bad Date Title", "date-2", new Date(Number.NaN)],
            ],
          },
        ],
      },
      "Juno Wholesale New Preorders 01 June 2026.xlsx",
    );

    expect(parsed.items.map((item) => item.releaseDate)).toEqual(["2026-07-24", null]);
  });

  it("ignores blank headers and normalizes missing or whitespace cells", () => {
    const parsed = parseJunoWorkbook(
      {
        sheets: [
          {
            sheetName: "Sparse",
            rows: [[null, "Artist", "Title", "Missing"], ["ignored", "Sparse Artist", " "]],
          },
        ],
      },
      "Manual Upload.xlsx",
    );

    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]).toMatchObject({
      artist: "Sparse Artist",
      title: null,
      raw: {
        Artist: "Sparse Artist",
        Title: " ",
        Missing: null,
      },
    });
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

async function workbookBuffer(
  sheetName: string,
  rows: Array<Record<string, unknown>>,
  extraSheets: Array<{ sheetName: string; rows: Array<Record<string, unknown>> }> = [],
): Promise<Buffer> {
  const file = await writeXlsxFile(
    [
      { sheet: sheetName, data: rowsToSheetData(rows) },
      ...extraSheets.map((sheet) => ({ sheet: sheet.sheetName, data: rowsToSheetData(sheet.rows) })),
    ] satisfies Sheet<Buffer>[],
    { buffer: true } as never,
  );
  return (file as { toBuffer: () => Promise<Buffer> }).toBuffer();
}

function rowsToSheetData(rows: Array<Record<string, unknown>>): SheetData {
  return rowsToWorkbookRows(rows).map((row) => row.map((value) => ({ value: value ?? undefined })));
}

function rowsToWorkbookRows(rows: Array<Record<string, unknown>>): Array<Array<string | number | boolean | Date | null>> {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return [
    headers,
    ...rows.map((row) => headers.map((header) => normalizeTestCell(row[header]))),
  ];
}

function normalizeTestCell(value: unknown): string | number | boolean | Date | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return String(value);
}
