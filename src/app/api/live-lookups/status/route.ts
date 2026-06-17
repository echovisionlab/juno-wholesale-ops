import { withJunoLiveRepository } from "@/lib/juno-live/repository";

export const dynamic = "force-dynamic";

export async function GET() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return Response.json({ error: "DATABASE_URL is not configured" }, { status: 503 });
  }
  const summary = await withJunoLiveRepository(databaseUrl, (repository) => repository.getSummary());
  return Response.json({ summary });
}
