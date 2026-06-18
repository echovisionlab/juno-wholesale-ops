import { Pool } from "pg";
import { randomBytes } from "node:crypto";
import {
  serviceSettingColumns,
  type ServiceSettingsPatch,
  type ServiceSettingsRow,
  type ServiceSettingColumn,
} from "./descriptors";

const selectServiceSettingsColumns = [
  ...serviceSettingColumns,
  "updated_at",
].join(", ");

const serviceSettingColumnSet = new Set<ServiceSettingColumn>(serviceSettingColumns);

export async function getServiceSettings(databaseUrl: string): Promise<ServiceSettingsRow | null> {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    return await getServiceSettingsClient(pool);
  } finally {
    await pool.end();
  }
}

export async function ensureServiceSettingsRow(databaseUrl: string): Promise<ServiceSettingsRow> {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    return await ensureServiceSettingsRowClient(pool);
  } finally {
    await pool.end();
  }
}

export async function updateServiceSettings(
  databaseUrl: string,
  patch: ServiceSettingsPatch,
): Promise<ServiceSettingsRow> {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    await ensureServiceSettingsRowClient(pool);
    const entries = Object.entries(patch).filter(([column]) =>
      serviceSettingColumnSet.has(column as ServiceSettingColumn),
    ) as Array<[ServiceSettingColumn, string | number | boolean | null]>;

    if (entries.length === 0) {
      return await ensureServiceSettingsRowClient(pool);
    }

    const assignments = entries.map(([column], index) => `${quoteIdentifier(column)} = $${index + 1}`);
    const result = await pool.query<ServiceSettingsRow>(
      `
        UPDATE service_setting
        SET ${assignments.join(", ")},
            updated_at = now()
        WHERE id = true
        RETURNING ${selectServiceSettingsColumns}
      `,
      entries.map(([, value]) => value),
    );
    return result.rows[0];
  } finally {
    await pool.end();
  }
}

export async function clearServiceSettingOverrides(
  databaseUrl: string,
  keys: ServiceSettingColumn[],
): Promise<ServiceSettingsRow> {
  const patch = Object.fromEntries(keys.map((key) => [key, null])) as ServiceSettingsPatch;
  return updateServiceSettings(databaseUrl, patch);
}

export async function countAdminUsers(databaseUrl: string): Promise<number> {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    const result = await pool.query<{ count: string }>(
      `
        SELECT count(*)::text AS count
        FROM auth_user
        WHERE role = 'admin'
      `,
    );
    return Number(result.rows[0]?.count ?? 0);
  } finally {
    await pool.end();
  }
}

export async function ensureDatabaseAuthSecretClient(queryable: Pool): Promise<string> {
  await ensureServiceSettingsRowClient(queryable);
  const generatedSecret = randomBytes(48).toString("base64url");
  const updated = await queryable.query<{ auth_secret: string }>(
    `
      UPDATE service_setting
      SET auth_secret = $1,
          updated_at = now()
      WHERE id = true
        AND auth_secret IS NULL
      RETURNING auth_secret
    `,
    [generatedSecret],
  );
  if (updated.rows[0]?.auth_secret) {
    return updated.rows[0].auth_secret;
  }

  const existing = await queryable.query<{ auth_secret: string }>(
    `
      SELECT auth_secret
      FROM service_setting
      WHERE id = true
      LIMIT 1
    `,
  );
  const authSecret = existing.rows[0]?.auth_secret;
  if (!authSecret) {
    throw new Error("auth_secret was not available after initialization");
  }
  return authSecret;
}

async function getServiceSettingsClient(queryable: Pool): Promise<ServiceSettingsRow | null> {
  const result = await queryable.query<ServiceSettingsRow>(
    `
      SELECT ${selectServiceSettingsColumns}
      FROM service_setting
      WHERE id = true
      LIMIT 1
    `,
  );
  return result.rows[0] ?? null;
}

async function ensureServiceSettingsRowClient(queryable: Pool): Promise<ServiceSettingsRow> {
  await queryable.query(`
    INSERT INTO service_setting (id)
    VALUES (true)
    ON CONFLICT (id) DO NOTHING
  `);
  const row = await getServiceSettingsClient(queryable);
  if (!row) {
    throw new Error("service_setting row was not available after initialization");
  }
  return row;
}

function quoteIdentifier(identifier: ServiceSettingColumn): string {
  if (!serviceSettingColumnSet.has(identifier)) {
    throw new Error(`Unsupported service setting column: ${identifier}`);
  }
  return `"${identifier}"`;
}
