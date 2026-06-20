import { requireAdmin } from "@/lib/auth/admin";
import {
  createDashboardSavedView,
  deleteDashboardSavedView,
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
    const view = await createDashboardSavedView(getDatabaseUrl(), (await parseJson(request)) as DashboardSavedViewInput);
    return Response.json({ view }, { status: 201 });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const authorization = await requireAdmin(request);
  if (!authorization.authorized) {
    return authorization.response;
  }

  try {
    const view = await updateDashboardSavedView(getDatabaseUrl(), (await parseJson(request)) as DashboardSavedViewPatch);
    if (!view) {
      return Response.json({ error: "dashboard_saved_view_not_found" }, { status: 404 });
    }
    return Response.json({ view });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 400 });
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Invalid dashboard saved view request";
}
