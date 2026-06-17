import { requireAdmin } from "@/lib/auth/admin";
import { getGmailIngestState } from "@/lib/ingest/repository";

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

  const state = await getGmailIngestState(databaseUrl);
  return Response.json({ state });
}
