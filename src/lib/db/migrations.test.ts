import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertMasterSchemaManifestMatchesMigrations,
  assertMasterSchemaSqlMatchesGenerated,
  buildMasterSchemaSql,
  buildMigrationManifestHash,
  loadMigrationFiles,
  maxMigrationVersion,
  parseMigrationFilename,
  readMasterSchemaManifestHash,
  validateAppliedMigrations,
  validateMigrationSequence,
  type AppliedMigration,
  type MigrationFile,
} from "./migrations";

describe("migration files", () => {
  it("parses zero-padded versions and supports more than 1000 migrations", () => {
    expect(parseMigrationFilename("0001000_large_sequence.sql")).toEqual({
      version: 1000,
      filename: "0001000_large_sequence.sql",
      name: "large_sequence",
    });
    expect(parseMigrationFilename("9999999_last.sql").version).toBe(maxMigrationVersion);
  });

  it("rejects invalid filenames and out-of-range versions", () => {
    expect(() => parseMigrationFilename("0000_zero.sql")).toThrow("outside 1..9999999");
    expect(() => parseMigrationFilename("10000000_overflow.sql")).toThrow("Invalid migration filename");
    expect(() => parseMigrationFilename("0001-Bad.sql")).toThrow("Invalid migration filename");
  });

  it("requires gapless sequential versions from 1", () => {
    expect(validateMigrationSequence([migration(2), migration(1)]).map((entry) => entry.version)).toEqual([1, 2]);
    expect(() => validateMigrationSequence([migration(1), migration(1, "again")])).toThrow(
      "Duplicate migration version 1",
    );
    expect(() => validateMigrationSequence([migration(1), migration(3)])).toThrow(
      "expected 2, got 3",
    );
  });

  it("loads migrations from disk and builds a manifest hash", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "wholesale-migrations-"));
    await fs.writeFile(path.join(tmpDir, "0002_second.sql"), "SELECT 2;\n");
    await fs.writeFile(path.join(tmpDir, "0001_first.sql"), "SELECT 1;\n");

    const migrations = await loadMigrationFiles(tmpDir);
    const masterSql = buildMasterSchemaSql("CREATE TABLE demo (id integer);\n", migrations);
    const masterSchemaPath = await writeMaster(await fs.mkdtemp(path.join(os.tmpdir(), "wholesale-master-")), masterSql);

    expect(migrations.map((entry) => entry.filename)).toEqual(["0001_first.sql", "0002_second.sql"]);
    expect(readMasterSchemaManifestHash(masterSql)).toBe(buildMigrationManifestHash(migrations));
    await expect(assertMasterSchemaManifestMatchesMigrations(masterSchemaPath, tmpDir)).resolves.toBeUndefined();
  });

  it("detects stale master schema SQL", () => {
    expect(() => assertMasterSchemaSqlMatchesGenerated("SELECT 1;\n", "SELECT 2;\n")).toThrow(
      "Master schema SQL is stale",
    );
    expect(() => assertMasterSchemaSqlMatchesGenerated("SELECT 1;\n", "SELECT 1;\n")).not.toThrow();
    expect(readMasterSchemaManifestHash("SELECT 1;")).toBeNull();
  });

  it("detects missing and stale master schema manifests", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "wholesale-migrations-"));
    const masterDir = await fs.mkdtemp(path.join(os.tmpdir(), "wholesale-master-"));
    await fs.writeFile(path.join(tmpDir, "0001_first.sql"), "SELECT 1;\n");

    const missingManifestPath = await writeMaster(masterDir, "SELECT 1;\n");
    await expect(assertMasterSchemaManifestMatchesMigrations(missingManifestPath, tmpDir)).rejects.toThrow(
      "got missing",
    );

    const staleManifestPath = await writeMaster(masterDir, "-- migration-manifest-sha256: stale\nSELECT 1;\n");
    await expect(assertMasterSchemaManifestMatchesMigrations(staleManifestPath, tmpDir)).rejects.toThrow(
      "got stale",
    );
  });
});

describe("applied migration validation", () => {
  it("rejects unknown, renamed, and edited applied migrations", () => {
    const migrations = [migration(1), migration(2)];

    expect(() => validateAppliedMigrations([applied(3)], migrations)).toThrow("unknown migration version 3");
    expect(() => validateAppliedMigrations([applied(1, { filename: "0001_other.sql" })], migrations)).toThrow(
      "filename mismatch",
    );
    expect(() => validateAppliedMigrations([applied(1, { name: "other" })], migrations)).toThrow(
      "name mismatch",
    );
    expect(() => validateAppliedMigrations([applied(1, { sha256: "b".repeat(64) })], migrations)).toThrow(
      "hash mismatch",
    );
    expect(() => validateAppliedMigrations([applied(1), applied(2)], migrations)).not.toThrow();
  });
});

function migration(version: number, name = `migration_${version}`): MigrationFile {
  const filename = `${String(version).padStart(4, "0")}_${name}.sql`;
  return {
    version,
    filename,
    name,
    sql: `SELECT ${version};\n`,
    sha256: "a".repeat(64),
  };
}

function applied(version: number, overrides: Partial<AppliedMigration> = {}): AppliedMigration {
  const base = migration(version);
  return {
    version: base.version,
    filename: base.filename,
    name: base.name,
    sha256: base.sha256,
    ...overrides,
  };
}

async function writeMaster(tmpDir: string, sql: string): Promise<string> {
  const filePath = path.join(tmpDir, "schema.sql");
  await fs.writeFile(filePath, sql);
  return filePath;
}
