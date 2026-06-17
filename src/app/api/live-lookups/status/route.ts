import { requireAdmin } from "@/lib/auth/admin";
import { withJunoLiveRepository } from "@/lib/juno-live/repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authorization = await requireAdmin(request);
  if (!authorization.authorized) {
    return authorization.response;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return Response.json({ summary: null });
  }
  const summary = await withJunoLiveRepository(databaseUrl, (repository) => repository.getSummary());
  return Response.json({ summary });
}
