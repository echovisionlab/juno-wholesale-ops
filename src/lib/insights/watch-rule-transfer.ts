import { Pool, type PoolClient } from "pg";
import { z } from "zod";
import { normalizeCatalogText } from "./normalize";
import type { WatchRule, WatchRuleType } from "./watch-matcher";

export type WatchRuleDefinition = {
  type: WatchRuleType;
  pattern: string;
  weight: number;
  enabled: boolean;
};

export type WatchRuleExportPayload = {
  schemaVersion: 1;
  exportedAt: string;
  rules: WatchRuleDefinition[];
};

export type WatchRuleImportItem = {
  index: number;
  action: "create" | "update" | "skip";
  status: "valid" | "invalid" | "duplicate";
  rule: WatchRuleDefinition | null;
  normalizedKey: string | null;
  existingRuleId: string | null;
  reason: string | null;
  importedRule?: WatchRule;
};

export type WatchRuleImportResult = {
  dryRun: boolean;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  invalid: number;
  duplicateInPayload: number;
  items: WatchRuleImportItem[];
};

type WatchRuleRow = {
  id: string;
  type: WatchRuleType;
  pattern: string;
  pattern_norm: string;
  weight: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

type NormalizedDefinition = {
  rule: WatchRuleDefinition;
  patternNorm: string;
  normalizedKey: string;
};

const watchRuleTypeValues = ["artist", "label", "genre", "keyword", "exclude_keyword"] as const satisfies WatchRuleType[];
const watchRuleImportMaxRules = 500;
const watchRulePatternMaxLength = 200;

const watchRuleDefinitionSchema = z
  .object(
    {
      type: z.enum(watchRuleTypeValues, { error: "Rule type is invalid" }),
      pattern: z
        .string({ error: "Rule pattern is required" })
        .trim()
        .min(1, "Rule pattern is required")
        .max(watchRulePatternMaxLength, `Rule pattern must be ${watchRulePatternMaxLength} characters or fewer`),
      weight: z.number({ error: "Rule weight must be an integer between -100 and 100" })
        .int("Rule weight must be an integer between -100 and 100")
        .min(-100, "Rule weight must be an integer between -100 and 100")
        .max(100, "Rule weight must be an integer between -100 and 100")
        .optional(),
      enabled: z.boolean({ error: "Rule enabled must be a boolean when provided" }).optional(),
    },
    { error: "Rule must be an object" },
  )
  .transform((value, context): NormalizedDefinition => {
    const patternNorm = normalizeCatalogText(value.pattern);
    if (!patternNorm) {
      context.addIssue({
        code: "custom",
        message: "Rule pattern is required",
      });
      return z.NEVER;
    }

    const weight = value.weight ?? (value.type === "exclude_keyword" ? -10 : 10);
    return {
      rule: {
        type: value.type,
        pattern: value.pattern,
        weight,
        enabled: value.enabled ?? true,
      },
      patternNorm,
      normalizedKey: buildNormalizedKey(value.type, patternNorm),
    };
  });

const importRulesSchema = z
  .array(z.unknown(), { error: "Watch rule import payload must include a rules array" })
  .max(watchRuleImportMaxRules, `Watch rule import supports up to ${watchRuleImportMaxRules} rules`);

const importObjectEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(1, { error: "Unsupported watch rule import schema version" }).optional(),
    exportedAt: z.string({ error: "exportedAt must be a string when provided" }).optional(),
    rules: importRulesSchema.optional(),
    watchRules: importRulesSchema.optional(),
    dryRun: z.boolean({ error: "dryRun must be a boolean when provided" }).optional(),
  })
  .strict()
  .transform((value, context) => {
    const rules = value.rules ?? value.watchRules;
    if (!rules) {
      context.addIssue({
        code: "custom",
        message: "Watch rule import payload must include a rules array",
      });
      return z.NEVER;
    }
    return { rules, dryRun: value.dryRun };
  });

const watchRuleSelectColumns = `
  id::text,
  type,
  pattern,
  pattern_norm,
  weight,
  enabled,
  created_at::text,
  updated_at::text
`;

export function buildWatchRuleExportPayload(
  rules: WatchRule[],
  exportedAt = new Date().toISOString(),
): WatchRuleExportPayload {
  return {
    schemaVersion: 1,
    exportedAt,
    rules: rules.map((rule) => ({
      type: rule.type,
      pattern: rule.pattern,
      weight: rule.weight,
      enabled: rule.enabled,
    })),
  };
}

export async function importWatchRules(
  databaseUrl: string,
  payload: unknown,
  options: { dryRun?: boolean } = {},
): Promise<WatchRuleImportResult> {
  const parsed = parseImportEnvelope(payload);
  const dryRun = options.dryRun ?? parsed.dryRun ?? true;
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });

  try {
    const client = await pool.connect();
    let transactionClosed = false;
    try {
      await client.query("BEGIN");
      const result = await importWatchRulesClient(client, parsed.rules, dryRun);
      if (dryRun) {
        await client.query("ROLLBACK");
        transactionClosed = true;
      } else if (result.invalid > 0) {
        await client.query("ROLLBACK");
        transactionClosed = true;
        throw new Error("Resolve invalid watch rule rows before applying");
      } else {
        await client.query("COMMIT");
        transactionClosed = true;
      }
      return result;
    } catch (error) {
      if (!transactionClosed) {
        await client.query("ROLLBACK");
      }
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

async function importWatchRulesClient(
  client: PoolClient,
  entries: unknown[],
  dryRun: boolean,
): Promise<WatchRuleImportResult> {
  const existing = await listExistingRuleRefs(client);
  const seenKeys = new Set<string>();
  const items: WatchRuleImportItem[] = [];

  for (const [index, entry] of entries.entries()) {
    const normalized = normalizeDefinition(entry);
    if (!normalized.ok) {
      items.push({
        index,
        action: "skip",
        status: "invalid",
        rule: null,
        normalizedKey: null,
        existingRuleId: null,
        reason: normalized.reason,
      });
      continue;
    }

    if (seenKeys.has(normalized.definition.normalizedKey)) {
      items.push({
        index,
        action: "skip",
        status: "duplicate",
        rule: normalized.definition.rule,
        normalizedKey: normalized.definition.normalizedKey,
        existingRuleId: existing.get(normalized.definition.normalizedKey)?.id ?? null,
        reason: "Duplicate rule in import payload",
      });
      continue;
    }
    seenKeys.add(normalized.definition.normalizedKey);

    const existingRule = existing.get(normalized.definition.normalizedKey) ?? null;
    const action = existingRule ? "update" : "create";
    const item: WatchRuleImportItem = {
      index,
      action,
      status: "valid",
      rule: normalized.definition.rule,
      normalizedKey: normalized.definition.normalizedKey,
      existingRuleId: existingRule?.id ?? null,
      reason: null,
    };

    if (!dryRun) {
      item.importedRule = await upsertWatchRuleClient(client, normalized.definition);
      existing.set(normalized.definition.normalizedKey, { id: item.importedRule.id });
    }

    items.push(item);
  }

  return summarizeImportItems(dryRun, entries.length, items);
}

async function listExistingRuleRefs(client: PoolClient): Promise<Map<string, { id: string }>> {
  const result = await client.query<Pick<WatchRuleRow, "id" | "type" | "pattern_norm">>(
    "SELECT id::text, type, pattern_norm FROM watch_rule",
  );
  return new Map(result.rows.map((row) => [buildNormalizedKey(row.type, row.pattern_norm), { id: row.id }]));
}

async function upsertWatchRuleClient(client: PoolClient, definition: NormalizedDefinition): Promise<WatchRule> {
  const result = await client.query<WatchRuleRow>(
    `
      INSERT INTO watch_rule (type, pattern, pattern_norm, weight, enabled)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (type, pattern_norm) DO UPDATE SET
        pattern = EXCLUDED.pattern,
        weight = EXCLUDED.weight,
        enabled = EXCLUDED.enabled,
        updated_at = now()
      RETURNING ${watchRuleSelectColumns}
    `,
    [
      definition.rule.type,
      definition.rule.pattern,
      definition.patternNorm,
      definition.rule.weight,
      definition.rule.enabled,
    ],
  );
  return mapWatchRuleRow(result.rows[0]);
}

function parseImportEnvelope(payload: unknown): { rules: unknown[]; dryRun?: boolean } {
  if (Array.isArray(payload)) {
    const parsed = importRulesSchema.safeParse(payload);
    if (!parsed.success) {
      throw new Error(firstZodMessage(parsed.error, "Watch rule import payload must include a rules array"));
    }
    return { rules: parsed.data };
  }
  const parsed = importObjectEnvelopeSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(firstZodMessage(parsed.error, "Watch rule import payload must include a rules array"));
  }
  return parsed.data;
}

function normalizeDefinition(value: unknown):
  | { ok: true; definition: NormalizedDefinition }
  | { ok: false; reason: string } {
  const parsed = watchRuleDefinitionSchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, reason: parsed.error.issues[0]?.message ?? "Rule must be an object" };
  }
  return { ok: true, definition: parsed.data };
}

function firstZodMessage(error: z.ZodError, fallback: string): string {
  return error.issues[0]?.message ?? fallback;
}

function summarizeImportItems(dryRun: boolean, total: number, items: WatchRuleImportItem[]): WatchRuleImportResult {
  return {
    dryRun,
    total,
    created: items.filter((item) => item.status === "valid" && item.action === "create").length,
    updated: items.filter((item) => item.status === "valid" && item.action === "update").length,
    skipped: items.filter((item) => item.action === "skip").length,
    invalid: items.filter((item) => item.status === "invalid").length,
    duplicateInPayload: items.filter((item) => item.status === "duplicate").length,
    items,
  };
}

function buildNormalizedKey(type: WatchRuleType, patternNorm: string): string {
  return `${type}:${patternNorm}`;
}

function mapWatchRuleRow(row: WatchRuleRow): WatchRule {
  return {
    id: row.id,
    type: row.type,
    pattern: row.pattern,
    patternNorm: row.pattern_norm,
    weight: row.weight,
    enabled: row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
