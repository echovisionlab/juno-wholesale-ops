import { requireAdmin } from "@/lib/auth/admin";
import { getDatabaseUrl } from "@/lib/env";
import { getGmailIngestState } from "@/lib/ingest/repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authorization = await requireAdmin(request);
  if (!authorization.authorized) {
    return authorization.response;
  }

  const databaseUrl = getDatabaseUrl();
  const state = await getGmailIngestState(databaseUrl);
  return Response.json({ state });
}
