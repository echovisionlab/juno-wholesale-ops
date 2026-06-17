import fs from "node:fs/promises";
import path from "node:path";
import { dumpMigratedMasterSchema } from "./lib/dump-migrated-schema";

async function main() {
  const migrationsDir = path.join(process.cwd(), "infra/postgres/migrations");
  const masterSchemaPath = path.join(process.cwd(), "infra/postgres/schema.sql");
  const schemaSql = await dumpMigratedMasterSchema({ migrationsDir });
  await fs.writeFile(masterSchemaPath, schemaSql);
  console.log(JSON.stringify({ ok: true, path: masterSchemaPath }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
