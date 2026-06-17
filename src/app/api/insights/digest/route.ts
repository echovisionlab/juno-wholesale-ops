import { requireAdmin } from "@/lib/auth/admin";
import { getInsightDigest } from "@/lib/insights/trend-repository";

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

  const digest = await getInsightDigest(databaseUrl);
  return Response.json({ digest });
}
