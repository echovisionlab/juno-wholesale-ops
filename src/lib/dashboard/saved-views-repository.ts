import { Pool } from "pg";
import {
  normalizeDashboardSignalFilters,
  type DashboardSignalFilters,
} from "./signal-filters";

export type DashboardSavedView = {
  id: string;
  name: string;
  filters: DashboardSignalFilters;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type DashboardSavedViewInput = {
  name: string;
  filters?: unknown;
  sortOrder?: number | null;
};

export type DashboardSavedViewPatch = {
  id: string;
  name?: string;
  filters?: unknown;
  sortOrder?: number | null;
};

type DashboardSavedViewRow = {
  id: string;
  name: string;
  filters: unknown;
  sort_order: number;
  created_at: Date | string;
  updated_at: Date | string;
};

export async function listDashboardSavedViews(databaseUrl: string): Promise<DashboardSavedView[]> {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    const result = await pool.query<DashboardSavedViewRow>(
      `
        SELECT id::text, name, filters, sort_order, created_at, updated_at
        FROM dashboard_saved_view
        ORDER BY sort_order ASC, name ASC
      `,
    );
    return result.rows.map(mapDashboardSavedView);
  } finally {
    await pool.end();
  }
}

export async function createDashboardSavedView(
  databaseUrl: string,
  input: DashboardSavedViewInput,
): Promise<DashboardSavedView> {
  const validated = validateDashboardSavedViewInput(input);
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    const result = await pool.query<DashboardSavedViewRow>(
      `
        INSERT INTO dashboard_saved_view (name, filters, sort_order)
        VALUES ($1, $2::jsonb, $3)
        RETURNING id::text, name, filters, sort_order, created_at, updated_at
      `,
      [validated.name, JSON.stringify(validated.filters), validated.sortOrder],
    );
    return mapDashboardSavedView(result.rows[0]);
  } finally {
    await pool.end();
  }
}

export async function updateDashboardSavedView(
  databaseUrl: string,
  patch: DashboardSavedViewPatch,
): Promise<DashboardSavedView | null> {
  const validated = validateDashboardSavedViewPatch(patch);
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    const current = await pool.query<DashboardSavedViewRow>(
      `
        SELECT id::text, name, filters, sort_order, created_at, updated_at
        FROM dashboard_saved_view
        WHERE id = $1
      `,
      [validated.id],
    );
    if (!current.rows[0]) {
      return null;
    }

    const nextName = validated.name ?? current.rows[0].name;
    const nextFilters = validated.filters ?? normalizeDashboardSignalFilters(current.rows[0].filters);
    const nextSortOrder = validated.sortOrder ?? current.rows[0].sort_order;
    const updated = await pool.query<DashboardSavedViewRow>(
      `
        UPDATE dashboard_saved_view
        SET name = $2,
            filters = $3::jsonb,
            sort_order = $4,
            updated_at = now()
        WHERE id = $1
        RETURNING id::text, name, filters, sort_order, created_at, updated_at
      `,
      [validated.id, nextName, JSON.stringify(nextFilters), nextSortOrder],
    );
    return mapDashboardSavedView(updated.rows[0]);
  } finally {
    await pool.end();
  }
}

export async function deleteDashboardSavedView(databaseUrl: string, id: string): Promise<boolean> {
  const viewId = validateDashboardSavedViewId(id);
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    const result = await pool.query("DELETE FROM dashboard_saved_view WHERE id = $1", [viewId]);
    return (result.rowCount ?? 0) > 0;
  } finally {
    await pool.end();
  }
}

function validateDashboardSavedViewInput(input: DashboardSavedViewInput): {
  name: string;
  filters: DashboardSignalFilters;
  sortOrder: number;
} {
  return {
    name: validateDashboardSavedViewName(input.name),
    filters: normalizeDashboardSignalFilters(input.filters),
    sortOrder: validateSortOrder(input.sortOrder),
  };
}

function validateDashboardSavedViewPatch(patch: DashboardSavedViewPatch): {
  id: string;
  name?: string;
  filters?: DashboardSignalFilters;
  sortOrder?: number;
} {
  const validated: {
    id: string;
    name?: string;
    filters?: DashboardSignalFilters;
    sortOrder?: number;
  } = {
    id: validateDashboardSavedViewId(patch.id),
  };
  if ("name" in patch && patch.name !== undefined) {
    validated.name = validateDashboardSavedViewName(patch.name);
  }
  if ("filters" in patch) {
    validated.filters = normalizeDashboardSignalFilters(patch.filters);
  }
  if ("sortOrder" in patch && patch.sortOrder !== undefined) {
    validated.sortOrder = validateSortOrder(patch.sortOrder);
  }
  return validated;
}

function validateDashboardSavedViewName(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Dashboard saved view name is required");
  }
  const trimmed = value.trim();
  if (trimmed.length > 80) {
    throw new Error("Dashboard saved view name must be 80 characters or fewer");
  }
  return trimmed;
}

function validateDashboardSavedViewId(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Dashboard saved view id is required");
  }
  return value.trim();
}

function validateSortOrder(value: unknown): number {
  if (value === null || value === undefined) {
    return 0;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 1000) {
    throw new Error("Dashboard saved view sort order must be an integer between 0 and 1000");
  }
  return value;
}

function mapDashboardSavedView(row: DashboardSavedViewRow): DashboardSavedView {
  return {
    id: row.id,
    name: row.name,
    filters: normalizeDashboardSignalFilters(row.filters),
    sortOrder: row.sort_order,
    createdAt: formatDatabaseDate(row.created_at),
    updatedAt: formatDatabaseDate(row.updated_at),
  };
}

function formatDatabaseDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}
