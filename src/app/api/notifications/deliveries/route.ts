import { listNotificationDeliveries } from "@/lib/notifications/repository";
import {
  authorizeNotificationRequest,
  databaseUrlResponse,
  parseLimit,
} from "../_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const unauthorized = await authorizeNotificationRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  const database = databaseUrlResponse();
  if ("response" in database) {
    return database.response;
  }

  const limit = parseLimit(new URL(request.url).searchParams.get("limit"), 100, 1, 200);
  const deliveries = await listNotificationDeliveries(database.databaseUrl, limit);
  return Response.json({ deliveries });
}
