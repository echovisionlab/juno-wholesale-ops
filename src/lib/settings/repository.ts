import { Pool } from "pg";
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
