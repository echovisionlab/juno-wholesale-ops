import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  resetApplicationTables,
  startMigratedPostgresTestDatabase,
  type StartedPostgresTestDatabase,
} from "@/test/postgres";
import {
  createDashboardSavedView,
  DashboardSavedViewNameConflictError,
  deleteDashboardSavedView,
  listDashboardSavedViews,
  updateDashboardSavedView,
} from "./saved-views-repository";

describe("dashboard saved views repository", () => {
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

  it("creates, lists, updates, and deletes sanitized saved views", async () => {
    const databaseUrl = database.container.getConnectionUri();

    const created = await createDashboardSavedView(databaseUrl, {
      name: "Watch warnings",
      filters: {
        signalTypes: ["watch_hit", "unknown", "watch_hit"],
        severities: ["warning"],
        lowStockOnly: true,
        dateRange: "7d",
        rawCatalogRow: { should: "not persist" },
      },
      sortOrder: 2,
    });
    const second = await createDashboardSavedView(databaseUrl, {
      name: "All movement",
      filters: { movementOnly: true },
      sortOrder: 1,
    });
    const listed = await listDashboardSavedViews(databaseUrl);

    expect(created).toMatchObject({
      name: "Watch warnings",
      filters: {
        signalTypes: ["watch_hit"],
        severities: ["warning"],
        lowStockOnly: true,
        movementOnly: false,
        watchHitsOnly: false,
        dateRange: "7d",
      },
      sortOrder: 2,
    });
    expect(JSON.stringify(created.filters)).not.toContain("rawCatalogRow");
    expect(listed.map((view) => view.id)).toEqual([second.id, created.id]);

    const updated = await updateDashboardSavedView(databaseUrl, {
      id: created.id,
      name: "Low stock",
      filters: {
        signalTypes: ["low_catalog_stock"],
        severities: ["warning", "critical"],
        dateRange: "today",
      },
      sortOrder: 0,
    });
    expect(updated).toMatchObject({
      id: created.id,
      name: "Low stock",
      filters: expect.objectContaining({
        signalTypes: ["low_catalog_stock"],
        severities: ["warning", "critical"],
        dateRange: "today",
      }),
      sortOrder: 0,
    });
    await expect(updateDashboardSavedView(databaseUrl, { id: "00000000-0000-0000-0000-000000000000" })).resolves.toBeNull();
    await expect(deleteDashboardSavedView(databaseUrl, second.id)).resolves.toBe(true);
    await expect(deleteDashboardSavedView(databaseUrl, second.id)).resolves.toBe(false);
  });

  it("validates saved view input", async () => {
    const databaseUrl = database.container.getConnectionUri();

    await expect(createDashboardSavedView(databaseUrl, { name: "" })).rejects.toThrow(
      "Dashboard saved view name is required",
    );
    await expect(createDashboardSavedView(databaseUrl, {
      name: "x".repeat(81),
    })).rejects.toThrow("Dashboard saved view name must be 80 characters or fewer");
    await expect(createDashboardSavedView(databaseUrl, {
      name: "Bad sort",
      sortOrder: -1,
    })).rejects.toThrow("Dashboard saved view sort order must be an integer between 0 and 1000");
    await expect(updateDashboardSavedView(databaseUrl, { id: "" })).rejects.toThrow(
      "Dashboard saved view id is required",
    );
    await expect(deleteDashboardSavedView(databaseUrl, "")).rejects.toThrow("Dashboard saved view id is required");
  });

  it("reports duplicate saved view names as an operator-safe conflict", async () => {
    const databaseUrl = database.container.getConnectionUri();

    await createDashboardSavedView(databaseUrl, { name: "Watch hits" });
    await expect(createDashboardSavedView(databaseUrl, { name: "Watch hits" })).rejects.toBeInstanceOf(
      DashboardSavedViewNameConflictError,
    );

    const other = await createDashboardSavedView(databaseUrl, { name: "Warnings" });
    await expect(updateDashboardSavedView(databaseUrl, { id: other.id, name: "Watch hits" })).rejects.toBeInstanceOf(
      DashboardSavedViewNameConflictError,
    );
  });
});
