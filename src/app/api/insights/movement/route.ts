import { requireAdmin } from "@/lib/auth/admin";
import { getDatabaseUrl } from "@/lib/env";
import { getMovementSignals } from "@/lib/insights/movement-repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authorization = await requireAdmin(request);
  if (!authorization.authorized) {
    return authorization.response;
  }

  const databaseUrl = getDatabaseUrl();
  const limit = parseNumber(new URL(request.url).searchParams.get("limit"), 100, 1, 200);
  const signals = await getMovementSignals(databaseUrl, limit);
  return Response.json({ signals });
}

function parseNumber(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = value ? Number.parseInt(value, 10) : fallback;
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return fallback;
  }
  return parsed;
}
