import { requireAdmin } from "@/lib/auth/admin";
import {
  createWatchRule,
  deleteWatchRule,
  listWatchRules,
  updateWatchRule,
  type WatchRuleInput,
  type WatchRulePatch,
} from "@/lib/insights/repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authorization = await requireAdmin(request);
  if (!authorization.authorized) {
    return authorization.response;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return Response.json({ error: "DATABASE_URL is not configured" }, { status: 503 });
  }

  const rules = await listWatchRules(databaseUrl);
  return Response.json({ rules });
}

export async function POST(request: Request) {
  const authorization = await requireAdmin(request);
  if (!authorization.authorized) {
    return authorization.response;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return Response.json({ error: "DATABASE_URL is not configured" }, { status: 503 });
  }

  try {
    const rule = await createWatchRule(databaseUrl, (await parseJson(request)) as WatchRuleInput);
    return Response.json({ rule }, { status: 201 });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const authorization = await requireAdmin(request);
  if (!authorization.authorized) {
    return authorization.response;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return Response.json({ error: "DATABASE_URL is not configured" }, { status: 503 });
  }

  try {
    const rule = await updateWatchRule(databaseUrl, (await parseJson(request)) as WatchRulePatch);
    if (!rule) {
      return Response.json({ error: "watch_rule_not_found" }, { status: 404 });
    }
    return Response.json({ rule });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const authorization = await requireAdmin(request);
  if (!authorization.authorized) {
    return authorization.response;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return Response.json({ error: "DATABASE_URL is not configured" }, { status: 503 });
  }

  try {
    const id = readId(await parseJson(request));
    const deleted = await deleteWatchRule(databaseUrl, id);
    if (!deleted) {
      return Response.json({ error: "watch_rule_not_found" }, { status: 404 });
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
  throw new Error("Watch rule id is required");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Invalid watch rule request";
}
