import { requireAdmin } from "@/lib/auth/admin";
import { getCatalogTrends } from "@/lib/insights/trend-repository";

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

  const searchParams = new URL(request.url).searchParams;
  const trends = await getCatalogTrends({
    databaseUrl,
    windowDays: parseNumber(searchParams.get("windowDays"), 7, 1, 90),
    previousWindowDays: parseNumber(searchParams.get("previousWindowDays"), 7, 1, 90),
    limit: parseNumber(searchParams.get("limit"), 20, 1, 100),
  });
  return Response.json({ trends });
}

function parseNumber(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = value ? Number.parseInt(value, 10) : fallback;
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return fallback;
  }
  return parsed;
}
