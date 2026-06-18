import path from "node:path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { applyMigrations } from "./migrations";
import { logInitialAdminResult, runStartupMigrations, type StartupMigrationLogger } from "./startup-migrations";

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

  it("requires DATABASE_URL from process env by default", async () => {
    vi.stubEnv("DATABASE_URL", "");

    await expect(runStartupMigrations({ logger: createLogger() })).rejects.toThrow();
  });

  it("rejects explicit env overrides without a database URL", async () => {
    await expect(runStartupMigrations({ env: {}, logger: createLogger() })).rejects.toThrow();
  });

  it("applies all migrations against Postgres", async () => {
    const container = await new PostgreSqlContainer(testPostgresImage).start();
    containers.push(container);
    const logger = createLogger();

    await expect(
      runStartupMigrations({
        env: {
          DATABASE_URL: container.getConnectionUri(),
          AUTH_SECRET: "a".repeat(32),
          AUTH_BASE_URL: "https://app.example.test",
          AUTH_INITIAL_ADMIN_EMAIL: "admin@example.test",
          AUTH_INITIAL_ADMIN_PASSWORD: "password123",
        },
        logger,
      }),
    ).resolves.toEqual({
      status: "applied",
      migrationCount: 15,
      latestVersion: 15,
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
      JSON.stringify({ event: "database_migrations_ready", migrationCount: 15, latestVersion: 15 }),
      JSON.stringify({ event: "initial_admin_seeded", email: "admin@example.test" }),
    ]);
  });

  it("uses the default logger and reports an empty migration list", async () => {
    const container = await new PostgreSqlContainer(testPostgresImage).start();
    containers.push(container);
    const pool = new Pool({ connectionString: container.getConnectionUri(), max: 1 });
    try {
      await applyMigrations(pool, path.join(process.cwd(), "infra/postgres/migrations"));
      await pool.query(
        `
          INSERT INTO auth_user (id, name, email, role)
          VALUES ('existing-admin', 'Existing Admin', 'admin@example.test', 'admin')
        `,
      );
    } finally {
      await pool.end();
    }
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await expect(
      runStartupMigrations({
        env: { DATABASE_URL: container.getConnectionUri() },
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
    expect(info).toHaveBeenCalledWith(
      JSON.stringify({ event: "initial_admin_ready", status: "skipped", reason: "existing_admin" }),
    );
  });

  it("logs generated initial admin credentials only when the account is created", () => {
    const logger = createLogger();

    logInitialAdminResult(logger, {
      status: "created",
      source: "generated",
      email: "admin+abc123abc123@localhost.invalid",
      password: "generated-password",
    });

    const generated = JSON.parse(logger.infoMessages[0] ?? "{}") as {
      event?: string;
      email?: string;
      password?: string;
      message?: string;
    };
    expect(generated).toMatchObject({
      event: "initial_admin_generated",
      email: "admin+abc123abc123@localhost.invalid",
      password: "generated-password",
      message: "Store this generated admin password now. It is logged only when the account is created.",
    });
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
