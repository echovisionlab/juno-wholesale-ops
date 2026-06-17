import crypto from "node:crypto";
import * as XLSX from "xlsx";

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

export function parseJunoCatalog(buffer: Buffer, filename: string): ParsedCatalog {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  return parseJunoWorkbook(workbook, filename);
}

export function parseJunoWorkbook(workbook: XLSX.WorkBook, filename: string): ParsedCatalog {
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error(`Workbook has no sheets: ${filename}`);
  }

  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: null,
    raw: false,
  });
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
    sheetName,
    catalogDate: inferCatalogDate(filename),
    contentHash,
    rowCount: items.length,
    items,
  };
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
