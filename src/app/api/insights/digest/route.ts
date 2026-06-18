import { requireAdmin } from "@/lib/auth/admin";
import { getDatabaseUrl } from "@/lib/env";
import { getInsightDigest } from "@/lib/insights/trend-repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authorization = await requireAdmin(request);
  if (!authorization.authorized) {
    return authorization.response;
  }

  const databaseUrl = getDatabaseUrl();
  const digest = await getInsightDigest(databaseUrl);
  return Response.json({ digest });
}
