import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  resetApplicationTables,
  startMigratedPostgresTestDatabase,
  type StartedPostgresTestDatabase,
} from "@/test/postgres";
import { createWatchRule, listWatchRules } from "./repository";
import { buildWatchRuleExportPayload, importWatchRules } from "./watch-rule-transfer";

describe("watch rule import and export", () => {
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

  it("exports watch rule definitions without ids or row data", async () => {
    const databaseUrl = database.container.getConnectionUri();
    const rule = await createWatchRule(databaseUrl, { type: "label", pattern: "Blue Note", weight: 12 });

    expect(buildWatchRuleExportPayload([]).rules).toEqual([]);
    expect(buildWatchRuleExportPayload([rule], "2026-06-20T00:00:00.000Z")).toEqual({
      schemaVersion: 1,
      exportedAt: "2026-06-20T00:00:00.000Z",
      rules: [{ type: "label", pattern: "Blue Note", weight: 12, enabled: true }],
    });
  });

  it("previews and applies schema-validated imports idempotently", async () => {
    const databaseUrl = database.container.getConnectionUri();
    const existing = await createWatchRule(databaseUrl, {
      type: "artist",
      pattern: "Lara Voss",
      weight: 8,
      enabled: true,
    });
    const payload = {
      rules: [
        { type: "artist", pattern: "Lara Voss", weight: 11, enabled: false },
        { type: "keyword", pattern: "limited edition", weight: 6, enabled: true },
        { type: "keyword", pattern: "Limited Edition", weight: 7, enabled: true },
        { type: "genre", pattern: "", weight: 2, enabled: true },
      ],
    };
    const applyPayload = { rules: payload.rules.slice(0, 3), dryRun: false };

    const preview = await importWatchRules(databaseUrl, payload);
    const unchangedRules = await listWatchRules(databaseUrl);
    await expect(importWatchRules(databaseUrl, { ...payload, dryRun: false })).rejects.toThrow(
      "Resolve invalid watch rule rows before applying",
    );
    await expect(listWatchRules(databaseUrl)).resolves.toEqual([
      expect.objectContaining({ id: existing.id, weight: 8, enabled: true }),
    ]);
    const applied = await importWatchRules(databaseUrl, applyPayload);
    const appliedAgain = await importWatchRules(databaseUrl, applyPayload);
    const rules = await listWatchRules(databaseUrl);

    expect(preview).toMatchObject({
      dryRun: true,
      total: 4,
      created: 1,
      updated: 1,
      skipped: 2,
      invalid: 1,
      duplicateInPayload: 1,
    });
    expect(preview.items).toEqual([
      expect.objectContaining({ action: "update", status: "valid", existingRuleId: existing.id }),
      expect.objectContaining({ action: "create", status: "valid", normalizedKey: "keyword:limited edition" }),
      expect.objectContaining({ action: "skip", status: "duplicate" }),
      expect.objectContaining({ action: "skip", status: "invalid", reason: "Rule pattern is required" }),
    ]);
    expect(unchangedRules).toEqual([expect.objectContaining({ id: existing.id, weight: 8, enabled: true })]);
    expect(applied).toMatchObject({
      dryRun: false,
      created: 1,
      updated: 1,
      skipped: 1,
    });
    expect(applied.items[0].importedRule).toMatchObject({ id: existing.id, weight: 11, enabled: false });
    expect(appliedAgain).toMatchObject({ dryRun: false, created: 0, updated: 2, skipped: 1 });
    expect(rules).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "artist", pattern: "Lara Voss", weight: 11, enabled: false }),
      expect.objectContaining({ type: "keyword", pattern: "limited edition", weight: 6, enabled: true }),
    ]));
  });

  it("keeps punctuation-only patterns as invalid rows and rejects apply until fixed", async () => {
    const databaseUrl = database.container.getConnectionUri();
    const payload = {
      rules: [
        { type: "keyword", pattern: " -- ", weight: 5 },
        { type: "label", pattern: "Blue Note", weight: 12 },
      ],
    };
    const result = await importWatchRules(databaseUrl, payload);

    expect(result).toMatchObject({
      dryRun: true,
      total: 2,
      created: 1,
      updated: 0,
      skipped: 1,
      invalid: 1,
    });
    expect(result.items).toEqual([
      expect.objectContaining({ action: "skip", status: "invalid", reason: "Rule pattern is required" }),
      expect.objectContaining({ action: "create", status: "valid", normalizedKey: "label:blue note" }),
    ]);
    await expect(importWatchRules(databaseUrl, { ...payload, dryRun: false })).rejects.toThrow(
      "Resolve invalid watch rule rows before applying",
    );
    await expect(listWatchRules(databaseUrl)).resolves.toEqual([]);

    await expect(
      importWatchRules(databaseUrl, {
        dryRun: false,
        rules: [{ type: "label", pattern: "Blue Note", weight: 12 }],
      }),
    ).resolves.toMatchObject({ dryRun: false, created: 1, invalid: 0 });
    await expect(listWatchRules(databaseUrl)).resolves.toEqual([
      expect.objectContaining({ type: "label", pattern: "Blue Note", weight: 12, enabled: true }),
    ]);
  });

  it("accepts array and watchRules envelopes with default weights", async () => {
    const databaseUrl = database.container.getConnectionUri();

    await expect(
      importWatchRules(databaseUrl, [{ type: "exclude_keyword", pattern: "damaged sleeve" }]),
    ).resolves.toMatchObject({
      dryRun: true,
      created: 1,
      updated: 0,
      skipped: 0,
    });
    await expect(
      importWatchRules(databaseUrl, {
        watchRules: [{ type: "artist", pattern: "Lara Voss" }],
        dryRun: false,
      }),
    ).resolves.toMatchObject({
      dryRun: false,
      created: 1,
      updated: 0,
      skipped: 0,
    });

    await expect(listWatchRules(databaseUrl)).resolves.toEqual([
      expect.objectContaining({ type: "artist", pattern: "Lara Voss", weight: 10, enabled: true }),
    ]);
  });

  it("rejects malformed import envelopes and fields", async () => {
    const databaseUrl = database.container.getConnectionUri();

    await expect(importWatchRules(databaseUrl, { dryRun: "yes", rules: [] })).rejects.toThrow(
      "dryRun must be a boolean when provided",
    );
    await expect(importWatchRules(databaseUrl, { items: [] })).rejects.toThrow(
      "Watch rule import payload must include a rules array",
    );
    await expect(importWatchRules(databaseUrl, { schemaVersion: 2, rules: [] })).rejects.toThrow(
      "Unsupported watch rule import schema version",
    );
    await expect(
      importWatchRules(databaseUrl, {
        rules: [
          null,
          { type: "unknown", pattern: "Lara Voss" },
          { type: "artist", pattern: "Lara Voss", weight: 101 },
          { type: "artist", pattern: "Lara Voss", enabled: "yes" },
        ],
      }),
    ).resolves.toMatchObject({
      total: 4,
      created: 0,
      updated: 0,
      skipped: 4,
      invalid: 4,
      duplicateInPayload: 0,
    });
  });
});
