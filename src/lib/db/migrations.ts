import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { Pool, PoolClient } from "pg";

export const maxMigrationVersion = 9999999;
const migrationManifestHashPrefix = "-- migration-manifest-sha256:";

export type MigrationFile = {
  version: number;
  filename: string;
  name: string;
  sql: string;
  sha256: string;
};

export type AppliedMigration = {
  version: number;
  filename: string;
  name: string;
  sha256: string;
};

type Queryable = Pick<Pool | PoolClient, "query">;

const migrationFilenamePattern = /^(\d{1,7})_([a-z0-9][a-z0-9_]*)\.sql$/;

export async function loadMigrationFiles(migrationsDir: string): Promise<MigrationFile[]> {
  const filenames = (await fs.readdir(migrationsDir)).filter((filename) => filename.endsWith(".sql"));
  return validateMigrationSequence(
    await Promise.all(
      filenames.map(async (filename) => {
        const parsed = parseMigrationFilename(filename);
        const sql = await fs.readFile(path.join(migrationsDir, filename), "utf8");
        return {
          ...parsed,
          sql,
          sha256: createSha256(sql),
        };
      }),
    ),
  );
}

export function validateMigrationSequence(migrations: MigrationFile[]): MigrationFile[] {
  const sorted = [...migrations].sort((left, right) => left.version - right.version);
  const seenVersions = new Set<number>();

  for (const [index, migration] of sorted.entries()) {
    const expectedVersion = index + 1;

    if (seenVersions.has(migration.version)) {
      throw new Error(`Duplicate migration version ${migration.version}`);
    }
    seenVersions.add(migration.version);

    if (migration.version !== expectedVersion) {
      throw new Error(`Migration versions must be sequential from 1; expected ${expectedVersion}, got ${migration.version}`);
    }
  }

  return sorted;
}

export function parseMigrationFilename(filename: string): Pick<MigrationFile, "version" | "filename" | "name"> {
  const match = migrationFilenamePattern.exec(filename);
  if (!match) {
    throw new Error(`Invalid migration filename "${filename}"; expected <1..9999999>_<name>.sql`);
  }

  const version = Number.parseInt(match[1], 10);
  if (!Number.isInteger(version) || version < 1 || version > maxMigrationVersion) {
    throw new Error(`Migration version ${match[1]} is outside 1..${maxMigrationVersion}`);
  }

  return {
    version,
    filename,
    name: match[2],
  };
}

export async function applyMigrations(pool: Pool, migrationsDir: string): Promise<AppliedMigration[]> {
  const migrations = await loadMigrationFiles(migrationsDir);
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [migrationAdvisoryLockKey()]);
    await ensureMigrationLedger(client);
    const applied = await loadAppliedMigrations(client);
    validateAppliedMigrations(applied, migrations);

    for (const migration of migrations) {
      if (applied.some((row) => row.version === migration.version)) {
        continue;
      }
      await client.query(migration.sql);
      await client.query(
        `
          INSERT INTO schema_migration (version, filename, name, sha256)
          VALUES ($1, $2, $3, $4)
        `,
        [migration.version, migration.filename, migration.name, migration.sha256],
      );
    }

    return loadAppliedMigrations(client);
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [migrationAdvisoryLockKey()]);
    client.release();
  }
}

async function ensureMigrationLedger(executor: Queryable): Promise<void> {
  await executor.query(`
    CREATE TABLE IF NOT EXISTS schema_migration (
      version integer PRIMARY KEY CHECK (version BETWEEN 1 AND 9999999),
      filename text NOT NULL UNIQUE,
      name text NOT NULL,
      sha256 text NOT NULL CHECK (length(sha256) = 64),
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

export async function loadAppliedMigrations(executor: Queryable): Promise<AppliedMigration[]> {
  const result = await executor.query<AppliedMigration>(
    `
      SELECT version, filename, name, sha256
      FROM schema_migration
      ORDER BY version
    `,
  );
  return result.rows;
}

export function validateAppliedMigrations(applied: AppliedMigration[], migrations: MigrationFile[]): void {
  const migrationsByVersion = new Map(migrations.map((migration) => [migration.version, migration]));

  for (const row of applied) {
    const migration = migrationsByVersion.get(row.version);
    if (!migration) {
      throw new Error(`Database has unknown migration version ${row.version}`);
    }
    if (row.filename !== migration.filename) {
      throw new Error(`Migration ${row.version} filename mismatch: database=${row.filename}, file=${migration.filename}`);
    }
    if (row.name !== migration.name) {
      throw new Error(`Migration ${row.version} name mismatch: database=${row.name}, file=${migration.name}`);
    }
    if (row.sha256 !== migration.sha256) {
      throw new Error(`Migration ${row.version} hash mismatch; do not edit applied migrations`);
    }
  }
}

export function buildMigrationManifestHash(migrations: MigrationFile[]): string {
  const manifest = validateMigrationSequence(migrations)
    .map((migration) => `${migration.version}:${migration.filename}:${migration.sha256}`)
    .join("\n");
  return createSha256(manifest);
}

export async function assertMasterSchemaManifestMatchesMigrations(
  masterSchemaPath: string,
  migrationsDir: string,
): Promise<void> {
  const [masterSchemaSql, migrations] = await Promise.all([
    fs.readFile(masterSchemaPath, "utf8"),
    loadMigrationFiles(migrationsDir),
  ]);
  const expectedHash = buildMigrationManifestHash(migrations);
  const actualHash = readMasterSchemaManifestHash(masterSchemaSql);

  if (actualHash !== expectedHash) {
    throw new Error(
      `Master schema migration manifest hash mismatch; expected ${expectedHash}, got ${actualHash ?? "missing"}`,
    );
  }
}

export function buildMasterSchemaSql(schemaDumpSql: string, migrations: MigrationFile[]): string {
  return `${migrationManifestHashPrefix} ${buildMigrationManifestHash(migrations)}\n${schemaDumpSql.trimEnd()}\n`;
}

export function assertMasterSchemaSqlMatchesGenerated(masterSchemaSql: string, generatedSchemaSql: string): void {
  if (masterSchemaSql.trimEnd() !== generatedSchemaSql.trimEnd()) {
    throw new Error("Master schema SQL is stale; run pnpm db:schema:dump");
  }
}

export function readMasterSchemaManifestHash(sql: string): string | null {
  const line = sql
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(migrationManifestHashPrefix));
  return line?.slice(migrationManifestHashPrefix.length).trim() ?? null;
}

function createSha256(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function migrationAdvisoryLockKey(): number {
  return 301303;
}
