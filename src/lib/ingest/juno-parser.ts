import crypto from "node:crypto";
import readXlsxFile from "read-excel-file/node";

export type CatalogKind = "preorder" | "in_stock" | "unknown";

export type ParsedCatalogItem = {
  rowNumber: number;
  junoId: string | null;
  artist: string | null;
  title: string | null;
  label: string | null;
  catNo: string | null;
  barcode: string | null;
  medium: string | null;
  description: string | null;
  genre: string | null;
  dealerExVatText: string | null;
  dealerPriceGbp: number | null;
  releaseDate: string | null;
  stock: number | null;
  maxOrder: number | null;
  raw: Record<string, unknown>;
};

export type ParsedCatalog = {
  kind: CatalogKind;
  sheetName: string;
  catalogDate: string | null;
  contentHash: string;
  rowCount: number;
  items: ParsedCatalogItem[];
};

export type JunoWorkbook = {
  sheets: Array<{
    sheetName: string;
    rows: SpreadsheetRow[];
  }>;
};

type SpreadsheetCell = string | number | boolean | Date | null;
type SpreadsheetRow = SpreadsheetCell[];
type ReadExcelSheet = {
  sheet: string;
  data: SpreadsheetRow[];
};

export const maxJunoWorkbookBytes = 10 * 1024 * 1024;
export const maxJunoWorkbookRows = 10_000;

const monthNumbers: Record<string, string> = {
  jan: "01",
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  sept: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
};

export async function parseJunoCatalog(buffer: Buffer, filename: string): Promise<ParsedCatalog> {
  if (buffer.byteLength > maxJunoWorkbookBytes) {
    throw new Error(`Workbook exceeds ${maxJunoWorkbookBytes} byte limit: ${filename}`);
  }
  const sheets = (await readXlsxFile(buffer, {
    sheets: [1],
    trim: true,
  } as Parameters<typeof readXlsxFile>[1])) as ReadExcelSheet[];
  return parseJunoWorkbook(
    {
      sheets: sheets.map((sheet) => ({
        sheetName: sheet.sheet,
        rows: sheet.data,
      })),
    },
    filename,
  );
}

export function parseJunoWorkbook(workbook: JunoWorkbook, filename: string): ParsedCatalog {
  const firstSheet = workbook.sheets[0];
  if (!firstSheet) {
    throw new Error(`Workbook has no sheets: ${filename}`);
  }

  const rows = sheetRowsToObjects(firstSheet.rows, filename);
  const kind = detectCatalogKind(filename, rows[0]);
  const items = rows
    .map((row, index) => normalizeRow(row, index + 2))
    .filter((row) => row.junoId || row.artist || row.title);
  const contentHash = stableHash({
    rows: items.map((item) => ({
      junoId: item.junoId,
      barcode: item.barcode,
      price: item.dealerPriceGbp,
      stock: item.stock,
      releaseDate: item.releaseDate,
      raw: item.raw,
    })),
  });

  return {
    kind,
    sheetName: firstSheet.sheetName,
    catalogDate: inferCatalogDate(filename),
    contentHash,
    rowCount: items.length,
    items,
  };
}

function sheetRowsToObjects(rows: SpreadsheetRow[], filename: string): Array<Record<string, unknown>> {
  if (rows.length === 0) {
    return [];
  }
  const [headerRow, ...dataRows] = rows;
  if (dataRows.length > maxJunoWorkbookRows) {
    throw new Error(`Workbook exceeds ${maxJunoWorkbookRows} row limit: ${filename}`);
  }
  const headers = headerRow.map((cell) => cellString(cell));
  return dataRows.map((row) => {
    const record: Record<string, unknown> = {};
    for (const [index, header] of headers.entries()) {
      if (header) {
        record[header] = row[index] ?? null;
      }
    }
    return record;
  });
}

function normalizeRow(row: Record<string, unknown>, rowNumber: number): ParsedCatalogItem {
  const description = cellString(row.Description);
  const medium = cellString(row.Medium);

  return {
    rowNumber,
    junoId: cellString(row["Juno ID"]),
    artist: cellString(row.Artist),
    title: cellString(row.Title),
    label: cellString(row.Label),
    catNo: cellString(row["Cat No"]),
    barcode: cellString(row.Barcode),
    medium,
    description,
    genre: cellString(row.Genre),
    dealerExVatText: cellString(row["Dealer Ex VAT"]),
    dealerPriceGbp: parsePriceGbp(row["Dealer Ex VAT"]),
    releaseDate: parseDate(row["Antic Rel Date"]),
    stock: parseInteger(row.Stock),
    maxOrder: parseInteger(row["Max Order"]),
    raw: row,
  };
}

function detectCatalogKind(filename: string, sample: Record<string, unknown> | undefined): CatalogKind {
  const text = `${filename} ${Object.keys(sample ?? {}).join(" ")}`.toLowerCase();
  if (text.includes("preorder") || text.includes("antic rel date")) {
    return "preorder";
  }
  if (text.includes("in stock") || text.includes("new releases") || text.includes("stock")) {
    return "in_stock";
  }
  return "unknown";
}

function parsePriceGbp(value: unknown): number | null {
  const text = cellString(value);
  const match = text?.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function parseInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  const text = cellString(value);
  if (!text) {
    return null;
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

function inferCatalogDate(filename: string): string | null {
  const match = filename.match(/\b(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\b/);
  if (!match) {
    return null;
  }
  const [, day, monthName, year] = match;
  const month = monthNumbers[monthName.toLowerCase()];
  if (!month) {
    return null;
  }
  return `${year}-${month}-${day.padStart(2, "0")}`;
}

function cellString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function stableHash(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
