import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetApplicationTables, startMigratedPostgresTestDatabase, type StartedPostgresTestDatabase } from "@/test/postgres";
import {
  clearServiceSettingOverrides,
  ensureServiceSettingsRow,
  getServiceSettings,
  updateServiceSettings,
} from "./repository";

describe("settings repository", () => {
  let database: StartedPostgresTestDatabase;
  let databaseUrl: string;

  beforeAll(async () => {
    database = await startMigratedPostgresTestDatabase();
    databaseUrl = database.container.getConnectionUri();
  });

  beforeEach(async () => {
    await resetApplicationTables(database.pool);
  });

  afterAll(async () => {
    await database.stop();
  });

  it("ensures, updates, and clears the singleton service_setting row", async () => {
    await database.pool.query("DELETE FROM service_setting");

    await expect(getServiceSettings(databaseUrl)).resolves.toBeNull();
    const ensured = await ensureServiceSettingsRow(databaseUrl);
    expect(ensured).toMatchObject({ juno_login_email: null, juno_login_password: null });

    const updated = await updateServiceSettings(databaseUrl, {
      juno_login_email: "buyer@example.test",
      juno_live_concurrency: 2,
      juno_login_password: "db-secret",
    });
    expect(updated).toMatchObject({
      juno_login_email: "buyer@example.test",
      juno_live_concurrency: 2,
      juno_login_password: "db-secret",
    });
    expect(updated.updated_at).toBeTruthy();

    const cleared = await clearServiceSettingOverrides(databaseUrl, ["juno_login_password", "juno_live_concurrency"]);
    expect(cleared).toMatchObject({
      juno_login_email: "buyer@example.test",
      juno_login_password: null,
      juno_live_concurrency: null,
    });

    await expect(updateServiceSettings(databaseUrl, {})).resolves.toMatchObject({
      juno_login_email: "buyer@example.test",
    });
  });
});
