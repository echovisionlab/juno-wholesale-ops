import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { parseJunoCatalog, type ParsedCatalog, type ParsedCatalogItem } from "@/lib/ingest/juno-parser";

export const demoFixtureRelativePaths = [
  "demo/fixtures/catalog/preorders-demo.xlsx",
  "demo/fixtures/catalog/in-stock-demo.xlsx",
] as const;

export type DemoFixtureRelativePath = (typeof demoFixtureRelativePaths)[number];

export type DemoCatalogFixture = {
  relativePath: DemoFixtureRelativePath;
  filename: string;
  sha256: string;
  bytes: Buffer;
  catalog: ParsedCatalog;
};

export type DemoFixtureSafetyIssue = {
  fixture: string;
  rowNumber?: number;
  field?: string;
  message: string;
};

const allowedSyntheticNamePattern = /^(demo|sample|synthetic|example|observed|archive|warehouse|signal|local)\b/i;
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const urlPattern = /\bhttps?:\/\//i;
const privateKeyPattern = /-----BEGIN [A-Z ]*PRIVATE KEY-----/i;

export async function loadDemoCatalogFixtures(rootDir = process.cwd()): Promise<DemoCatalogFixture[]> {
  const fixtures: DemoCatalogFixture[] = [];
  for (const relativePath of demoFixtureRelativePaths) {
    const absolutePath = path.join(rootDir, relativePath);
    const bytes = await fs.readFile(absolutePath);
    const filename = path.basename(relativePath);
    fixtures.push({
      relativePath,
      filename,
      sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      bytes,
      catalog: await parseJunoCatalog(bytes, filename),
    });
  }
  return fixtures;
}

export function assertSyntheticDemoCatalogFixtures(fixtures: DemoCatalogFixture[]): void {
  const issues = validateSyntheticDemoCatalogFixtures(fixtures);
  if (issues.length > 0) {
    throw new Error(
      `Demo fixture safety check failed:\n${issues
        .map((issue) => `${issue.fixture}${issue.rowNumber ? ` row ${issue.rowNumber}` : ""}: ${issue.message}`)
        .join("\n")}`,
    );
  }
}

export function validateSyntheticDemoCatalogFixtures(fixtures: DemoCatalogFixture[]): DemoFixtureSafetyIssue[] {
  return fixtures.flatMap((fixture) => validateSyntheticDemoCatalogFixture(fixture));
}

function validateSyntheticDemoCatalogFixture(fixture: DemoCatalogFixture): DemoFixtureSafetyIssue[] {
  const issues: DemoFixtureSafetyIssue[] = [];
  if (fixture.catalog.rowCount === 0) {
    issues.push({ fixture: fixture.relativePath, message: "fixture must include at least one catalog row" });
  }
  for (const item of fixture.catalog.items) {
    issues.push(...validateSyntheticDemoCatalogItem(fixture.relativePath, item));
  }
  return issues;
}

function validateSyntheticDemoCatalogItem(
  fixture: string,
  item: ParsedCatalogItem,
): DemoFixtureSafetyIssue[] {
  const issues: DemoFixtureSafetyIssue[] = [];
  if (!item.junoId?.startsWith("demo-")) {
    issues.push({
      fixture,
      rowNumber: item.rowNumber,
      field: "Juno ID",
      message: "demo Juno IDs must use the demo- prefix",
    });
  }
  if (item.catNo && !item.catNo.toUpperCase().startsWith("DEMO-")) {
    issues.push({
      fixture,
      rowNumber: item.rowNumber,
      field: "Cat No",
      message: "demo catalog numbers must use the DEMO- prefix",
    });
  }
  if (item.barcode && !/^0{6}\d{6}$/.test(item.barcode)) {
    issues.push({
      fixture,
      rowNumber: item.rowNumber,
      field: "Barcode",
      message: "demo barcodes must stay in the reserved 000000xxxxxx range",
    });
  }

  for (const [field, value] of Object.entries(item.raw)) {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) {
      continue;
    }
    if (emailPattern.test(text)) {
      issues.push({ fixture, rowNumber: item.rowNumber, field, message: "demo fixtures must not contain email addresses" });
    }
    if (urlPattern.test(text)) {
      issues.push({ fixture, rowNumber: item.rowNumber, field, message: "demo fixtures must not contain real URLs" });
    }
    if (privateKeyPattern.test(text)) {
      issues.push({ fixture, rowNumber: item.rowNumber, field, message: "demo fixtures must not contain private keys" });
    }
  }

  for (const [field, value] of [
    ["Artist", item.artist],
    ["Label", item.label],
    ["Title", item.title],
  ] as const) {
    if (value && !allowedSyntheticNamePattern.test(value)) {
      issues.push({
        fixture,
        rowNumber: item.rowNumber,
        field,
        message: "demo artist, label, and title values must be visibly synthetic",
      });
    }
  }

  return issues;
}
