import { requireAdmin } from "@/lib/auth/admin";
import { getDatabaseUrl } from "@/lib/env";
import { getTodaySignals } from "@/lib/insights/repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authorization = await requireAdmin(request);
  if (!authorization.authorized) {
    return authorization.response;
  }

  const databaseUrl = getDatabaseUrl();
  const limit = parseLimit(new URL(request.url).searchParams.get("limit"));
  const signals = await getTodaySignals(databaseUrl, limit);
  return Response.json({ signals });
}

function parseLimit(value: string | null): number {
  const parsed = value ? Number.parseInt(value, 10) : 100;
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 200) {
    return 100;
  }
  return parsed;
}
