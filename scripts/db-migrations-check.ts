import fs from "node:fs/promises";
import path from "node:path";
import { assertMasterSchemaSqlMatchesGenerated, loadMigrationFiles } from "@/lib/db/migrations";
import { dumpMigratedMasterSchema } from "./lib/dump-migrated-schema";

async function main() {
  const migrationsDir = path.join(process.cwd(), "infra/postgres/migrations");
  const masterSchemaPath = path.join(process.cwd(), "infra/postgres/schema.sql");
  const [migrations, masterSchemaSql, generatedSchemaSql] = await Promise.all([
    loadMigrationFiles(migrationsDir),
    fs.readFile(masterSchemaPath, "utf8"),
    dumpMigratedMasterSchema({ migrationsDir }),
  ]);
  assertMasterSchemaSqlMatchesGenerated(masterSchemaSql, generatedSchemaSql);
  console.log(
    JSON.stringify(
      {
        ok: true,
        migrationCount: migrations.length,
        latestVersion: migrations.at(-1)?.version ?? null,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
