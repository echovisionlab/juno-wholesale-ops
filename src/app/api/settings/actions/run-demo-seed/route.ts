import { seedDemoData } from "@/lib/demo/repository";
import {
  authorizeSettingsRequest,
  databaseUrlResponse,
  safeSettingsActionError,
} from "../../_shared";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authorization = await authorizeSettingsRequest(request);
  if (authorization) {
    return authorization;
  }

  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "demo_seed_disabled_in_production" }, { status: 403 });
  }

  const database = databaseUrlResponse();
  if ("response" in database) {
    return database.response;
  }

  try {
    const result = await seedDemoData({ databaseUrl: database.databaseUrl });
    return Response.json({ ok: true, result });
  } catch (error: unknown) {
    return Response.json({ ok: false, error: safeSettingsActionError(error) }, { status: 500 });
  }
}
