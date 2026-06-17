import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { applyMigrations, buildMasterSchemaSql, loadMigrationFiles } from "@/lib/db/migrations";

export const postgresSchemaDumpImage = "postgres:16-alpine";

export async function dumpMigratedMasterSchema(options: {
  migrationsDir: string;
}): Promise<string> {
  const container = await new PostgreSqlContainer(postgresSchemaDumpImage).start();
  const pool = new Pool({ connectionString: container.getConnectionUri(), max: 1 });

  try {
    const migrations = await loadMigrationFiles(options.migrationsDir);
    await applyMigrations(pool, options.migrationsDir);
    const dump = await container.exec(
      [
        "pg_dump",
        "--schema-only",
        "--no-owner",
        "--no-privileges",
        "--no-comments",
        "--restrict-key",
        "junoWholesaleOpsSchemaDump",
        "--username",
        container.getUsername(),
        "--dbname",
        container.getDatabase(),
      ],
      {
        env: {
          PGPASSWORD: container.getPassword(),
        },
      },
    );

    if (dump.exitCode !== 0) {
      throw new Error(`pg_dump failed: ${dump.stderr || dump.output}`);
    }

    return buildMasterSchemaSql(dump.stdout, migrations);
  } finally {
    await pool.end();
    await container.stop();
  }
}
