import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyMigrations, assertMasterSchemaSqlMatchesGenerated, loadAppliedMigrations } from "./migrations";
import { dumpMigratedMasterSchema } from "../../../scripts/lib/dump-migrated-schema";
import {
  startMigratedPostgresTestDatabase,
  type StartedPostgresTestDatabase,
} from "@/test/postgres";

describe("PostgreSQL migrations", () => {
  let database: StartedPostgresTestDatabase;

  beforeAll(async () => {
    database = await startMigratedPostgresTestDatabase();
  });

  afterAll(async () => {
    await database.stop();
  });

  it("applies every migration to a real PostgreSQL database and records hashes", async () => {
    await expect(applyMigrations(database.pool, database.migrationsDir)).resolves.toHaveLength(15);
    await expect(loadAppliedMigrations(database.pool)).resolves.toEqual([
      expect.objectContaining({
        version: 1,
        filename: "0001_init.sql",
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
      expect.objectContaining({
        version: 2,
        filename: "0002_juno_live_lookup.sql",
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
      expect.objectContaining({
        version: 3,
        filename: "0003_service_setting.sql",
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
      expect.objectContaining({
        version: 4,
        filename: "0004_catalog_content_hash_unique.sql",
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
      expect.objectContaining({
        version: 5,
        filename: "0005_ingest_cursor_and_auto_stock.sql",
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
      expect.objectContaining({
        version: 6,
        filename: "0006_configurable_ingest_settings.sql",
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
      expect.objectContaining({
        version: 7,
        filename: "0007_auth_and_email_settings.sql",
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
      expect.objectContaining({
        version: 8,
        filename: "0008_service_setting_guardrails.sql",
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
      expect.objectContaining({
        version: 9,
        filename: "0009_insights_foundation.sql",
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
      expect.objectContaining({
        version: 10,
        filename: "0010_stock_movement_insights.sql",
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
      expect.objectContaining({
        version: 11,
        filename: "0011_notification_delivery.sql",
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
      expect.objectContaining({
        version: 12,
        filename: "0012_settings_model_operator_ux.sql",
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
      expect.objectContaining({
        version: 13,
        filename: "0013_remove_auth_enabled_setting.sql",
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
      expect.objectContaining({
        version: 14,
        filename: "0014_auth_sign_in_guardrail.sql",
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
      expect.objectContaining({
        version: 15,
        filename: "0015_login_logo_url.sql",
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    ]);
  });

  it("detects edited historical migrations through the applied hash ledger", async () => {
    await database.pool.query("UPDATE schema_migration SET sha256 = $1 WHERE version = 1", ["b".repeat(64)]);

    await expect(applyMigrations(database.pool, database.migrationsDir)).rejects.toThrow(
      "hash mismatch",
    );
  });

  it("keeps master schema SQL in sync with a migrated database dump", async () => {
    const masterSchemaSql = await fs.readFile(path.join(process.cwd(), "infra/postgres/schema.sql"), "utf8");
    const generatedSchemaSql = await dumpMigratedMasterSchema({ migrationsDir: database.migrationsDir });

    expect(() => assertMasterSchemaSqlMatchesGenerated(masterSchemaSql, generatedSchemaSql)).not.toThrow();
  });
});
