import { requireAdmin } from "@/lib/auth/admin";
import {
  createDashboardSavedView,
  deleteDashboardSavedView,
  DashboardSavedViewNameConflictError,
  listDashboardSavedViews,
  updateDashboardSavedView,
  type DashboardSavedViewInput,
  type DashboardSavedViewPatch,
} from "@/lib/dashboard/saved-views-repository";
import { getDatabaseUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authorization = await requireAdmin(request);
  if (!authorization.authorized) {
    return authorization.response;
  }

  const views = await listDashboardSavedViews(getDatabaseUrl());
  return Response.json({ views });
}

export async function POST(request: Request) {
  const authorization = await requireAdmin(request);
  if (!authorization.authorized) {
    return authorization.response;
  }

  try {
    const view = await createDashboardSavedView(getDatabaseUrl(), readCreateInput(await parseJson(request)));
    return Response.json({ view }, { status: 201 });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: errorStatus(error) });
  }
}

export async function PATCH(request: Request) {
  const authorization = await requireAdmin(request);
  if (!authorization.authorized) {
    return authorization.response;
  }

  try {
    const view = await updateDashboardSavedView(getDatabaseUrl(), readPatchInput(await parseJson(request)));
    if (!view) {
      return Response.json({ error: "dashboard_saved_view_not_found" }, { status: 404 });
    }
    return Response.json({ view });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: errorStatus(error) });
  }
}

export async function DELETE(request: Request) {
  const authorization = await requireAdmin(request);
  if (!authorization.authorized) {
    return authorization.response;
  }

  try {
    const deleted = await deleteDashboardSavedView(getDatabaseUrl(), readId(await parseJson(request)));
    if (!deleted) {
      return Response.json({ error: "dashboard_saved_view_not_found" }, { status: 404 });
    }
    return Response.json({ deleted: true });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 400 });
  }
}

async function parseJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new Error("Request body must be valid JSON");
  }
}

function readId(value: unknown): string {
  if (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    value.id.trim()
  ) {
    return value.id;
  }
  throw new Error("Dashboard saved view id is required");
}

function readCreateInput(value: unknown): DashboardSavedViewInput {
  const body = readObjectBody(value);
  return {
    name: body.name as DashboardSavedViewInput["name"],
    filters: body.filters,
    sortOrder: body.sortOrder as DashboardSavedViewInput["sortOrder"],
  };
}

function readPatchInput(value: unknown): DashboardSavedViewPatch {
  const body = readObjectBody(value);
  const patch: DashboardSavedViewPatch = {
    id: body.id as DashboardSavedViewPatch["id"],
  };
  if ("name" in body) {
    patch.name = body.name as DashboardSavedViewPatch["name"];
  }
  if ("filters" in body) {
    patch.filters = body.filters;
  }
  if ("sortOrder" in body) {
    patch.sortOrder = body.sortOrder as DashboardSavedViewPatch["sortOrder"];
  }
  return patch;
}

function readObjectBody(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new Error("Dashboard saved view request body must be an object");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Invalid dashboard saved view request";
}

function errorStatus(error: unknown): number {
  return error instanceof DashboardSavedViewNameConflictError ? 409 : 400;
}
