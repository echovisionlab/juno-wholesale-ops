import { getGmailIngestState } from "@/lib/ingest/repository";

export const dynamic = "force-dynamic";

export async function GET() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return Response.json({ error: "DATABASE_URL is not configured" }, { status: 503 });
  }

  const state = await getGmailIngestState(databaseUrl);
  return Response.json({ state });
}
