import path from "node:path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { runStartupMigrations, type StartupMigrationLogger } from "./startup-migrations";

const testPostgresImage = "postgres:16-alpine";

describe("runStartupMigrations", () => {
  let containers: StartedPostgreSqlContainer[] = [];

  afterAll(async () => {
    await Promise.all(containers.map((container) => container.stop()));
    containers = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("reads process env by default", async () => {
    vi.stubEnv("DATABASE_URL", "");

    await expect(runStartupMigrations({ logger: createLogger() })).resolves.toEqual({
      status: "skipped",
      reason: "missing_database_url",
    });
  });

  it("skips when the database URL is not configured", async () => {
    await expect(runStartupMigrations({ env: {}, logger: createLogger() })).resolves.toEqual({
      status: "skipped",
      reason: "missing_database_url",
    });
  });

  it("applies all migrations against Postgres", async () => {
    const container = await new PostgreSqlContainer(testPostgresImage).start();
    containers.push(container);
    const logger = createLogger();

    await expect(
      runStartupMigrations({
        env: { DATABASE_URL: container.getConnectionUri() },
        logger,
      }),
    ).resolves.toEqual({
      status: "applied",
      migrationCount: 8,
      latestVersion: 8,
    });

    const pool = new Pool({ connectionString: container.getConnectionUri(), max: 1 });
    try {
      await expect(pool.query("SELECT count(*)::int AS count FROM gmail_ingest_state")).resolves.toMatchObject({
        rows: [{ count: 1 }],
      });
    } finally {
      await pool.end();
    }
    expect(logger.infoMessages).toEqual([
      JSON.stringify({ event: "database_migrations_ready", migrationCount: 8, latestVersion: 8 }),
    ]);
  });

  it("uses the default logger and reports an empty migration list", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await expect(
      runStartupMigrations({
        env: { DATABASE_URL: "postgres://user:pass@localhost:5432/juno_wholesale_ops" },
        migrate: async () => [],
      }),
    ).resolves.toEqual({
      status: "applied",
      migrationCount: 0,
      latestVersion: null,
    });

    expect(info).toHaveBeenCalledWith(
      JSON.stringify({ event: "database_migrations_ready", migrationCount: 0, latestVersion: null }),
    );
  });

  it("logs and rethrows migration failures without logging the database URL", async () => {
    const logger = createLogger();

    await expect(
      runStartupMigrations({
        env: { DATABASE_URL: "postgres://user:secret@localhost:5432/juno_wholesale_ops" },
        logger,
        migrationsDir: path.join(process.cwd(), "infra/postgres/migrations"),
        migrate: async () => {
          throw new Error("schema drift");
        },
      }),
    ).rejects.toThrow("schema drift");

    expect(logger.errorMessages).toEqual([
      JSON.stringify({ event: "database_migrations_failed", error: "schema drift" }),
    ]);
    expect(logger.errorMessages.join("\n")).not.toContain("secret");
  });

  it("normalizes non-error migration failures in logs", async () => {
    const logger = createLogger();

    await expect(
      runStartupMigrations({
        env: { DATABASE_URL: "postgres://user:secret@localhost:5432/juno_wholesale_ops" },
        logger,
        migrate: async () => {
          throw "schema drift";
        },
      }),
    ).rejects.toBe("schema drift");

    expect(logger.errorMessages).toEqual([
      JSON.stringify({ event: "database_migrations_failed", error: "Unknown startup migration error" }),
    ]);
  });
});

function createLogger(): StartupMigrationLogger & { errorMessages: string[]; infoMessages: string[] } {
  const errorMessages: string[] = [];
  const infoMessages: string[] = [];
  return {
    errorMessages,
    infoMessages,
    error(message?: unknown) {
      errorMessages.push(String(message));
    },
    info(message?: unknown) {
      infoMessages.push(String(message));
    },
  };
}
