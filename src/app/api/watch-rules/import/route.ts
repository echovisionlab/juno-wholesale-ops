import { requireAdmin } from "@/lib/auth/admin";
import { getDatabaseUrl } from "@/lib/env";
import { importWatchRules } from "@/lib/insights/watch-rule-transfer";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authorization = await requireAdmin(request);
  if (!authorization.authorized) {
    return authorization.response;
  }

  try {
    const result = await importWatchRules(getDatabaseUrl(), await parseJson(request));
    return Response.json({ result }, { status: result.dryRun ? 200 : 201 });
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Invalid watch rule import request";
}
