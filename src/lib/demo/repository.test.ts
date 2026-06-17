import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  resetApplicationTables,
  startMigratedPostgresTestDatabase,
  type StartedPostgresTestDatabase,
} from "@/test/postgres";
import {
  assertDemoResetAllowed,
  demoNotificationChannelName,
  demoResetConfirmFlag,
  resetDemoData,
  seedDemoData,
  seedDemoLiveObservations,
} from "./repository";

describe("demo repository", () => {
  let database: StartedPostgresTestDatabase;

  beforeAll(async () => {
    database = await startMigratedPostgresTestDatabase();
  });

  beforeEach(async () => {
    await resetApplicationTables(database.pool);
  });

  afterAll(async () => {
    await database.stop();
  });

  it("seeds synthetic snapshots, observed signals, movement signals, and in-app notifications", async () => {
    const databaseUrl = database.container.getConnectionUri();
    const result = await seedDemoData({ databaseUrl });

    expect(result).toMatchObject({
      snapshots: 2,
      insertedItems: 8,
      duplicateSnapshots: 0,
      watchRules: 4,
    });
    expect(result.insightSignals).toBeGreaterThan(0);
    expect(result.movementSignals).toBeGreaterThan(0);
    expect(result.notificationDeliveriesQueued).toBeGreaterThan(0);

    const counts = await database.pool.query<{
      suppliers: string;
      snapshots: string;
      signals: string;
      deliveries: string;
      webhook_channels: string;
    }>(`
      SELECT
        (SELECT count(*) FROM supplier WHERE code = 'demo')::text AS suppliers,
        (SELECT count(*) FROM catalog_snapshot JOIN supplier ON supplier.id = catalog_snapshot.supplier_id WHERE supplier.code = 'demo')::text AS snapshots,
        (SELECT count(*) FROM signal_event)::text AS signals,
        (SELECT count(*) FROM notification_delivery)::text AS deliveries,
        (SELECT count(*) FROM notification_channel WHERE name = '${demoNotificationChannelName}' AND type = 'webhook')::text AS webhook_channels
    `);
    expect(counts.rows[0]).toEqual({
      suppliers: "1",
      snapshots: "2",
      signals: expect.any(String),
      deliveries: expect.any(String),
      webhook_channels: "0",
    });
    expect(Number(counts.rows[0].signals)).toBeGreaterThan(0);
    expect(Number(counts.rows[0].deliveries)).toBeGreaterThan(0);

    const second = await seedDemoData({ databaseUrl });
    expect(second.duplicateSnapshots).toBe(2);
    expect(second.insertedItems).toBe(0);
  });

  it("resets only demo rows and refuses unsafe reset options", async () => {
    expect(() => assertDemoResetAllowed({ confirm: false, nodeEnv: "development" })).toThrow(demoResetConfirmFlag);
    expect(() => assertDemoResetAllowed({ confirm: true, nodeEnv: "production" })).toThrow("NODE_ENV=production");
    expect(() => assertDemoResetAllowed({ confirm: true, nodeEnv: "test" })).not.toThrow();

    const databaseUrl = database.container.getConnectionUri();
    await seedDemoData({ databaseUrl });
    await database.pool.query("INSERT INTO supplier (code, name) VALUES ('keeper', 'Keeper')");

    await expect(resetDemoData({ databaseUrl, confirm: false, nodeEnv: "test" })).rejects.toThrow(demoResetConfirmFlag);
    await expect(resetDemoData({ databaseUrl, confirm: false })).rejects.toThrow(demoResetConfirmFlag);
    const reset = await resetDemoData({ databaseUrl, confirm: true, nodeEnv: "test" });
    expect(reset.catalogSnapshotsDeleted).toBe(2);
    expect(reset.suppliersDeleted).toBe(1);

    const remaining = await database.pool.query<{ code: string }>("SELECT code FROM supplier ORDER BY code");
    expect(remaining.rows).toEqual([{ code: "keeper" }]);
  });

  it("rolls back demo reset and live observation failures", async () => {
    const databaseUrl = database.container.getConnectionUri();
    await seedDemoData({ databaseUrl });
    await database.pool.query(`
      CREATE FUNCTION demo_reset_fail() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'demo reset fail';
      END;
      $$;
    `);
    await database.pool.query(`
      CREATE TRIGGER demo_reset_fail
      BEFORE DELETE ON supplier
      FOR EACH ROW EXECUTE FUNCTION demo_reset_fail()
    `);
    await expect(resetDemoData({ databaseUrl, confirm: true, nodeEnv: "test" })).rejects.toThrow("demo reset fail");
    await database.pool.query("DROP TRIGGER demo_reset_fail ON supplier");
    await database.pool.query("DROP FUNCTION demo_reset_fail()");

    await resetApplicationTables(database.pool);
    await expect(seedDemoLiveObservations(databaseUrl)).resolves.toBeUndefined();

    await database.pool.query(
      "ALTER TABLE juno_live_observation ADD CONSTRAINT demo_observation_fail CHECK (false) NOT VALID",
    );
    try {
      await expect(seedDemoData({ databaseUrl })).rejects.toThrow("violates check constraint");
    } finally {
      await database.pool.query("ALTER TABLE juno_live_observation DROP CONSTRAINT demo_observation_fail");
    }
  });
});
