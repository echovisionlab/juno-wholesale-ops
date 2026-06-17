import { dispatchQueuedNotifications } from "@/lib/notifications/dispatcher";
import type { NotificationDispatchMode } from "@/lib/notifications/types";
import {
  authorizeNotificationRequest,
  databaseUrlResponse,
  errorMessage,
  parseLimit,
  parseOptionalJson,
} from "../_shared";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const unauthorized = await authorizeNotificationRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  const database = databaseUrlResponse();
  if ("response" in database) {
    return database.response;
  }

  try {
    const body = await parseOptionalJson(request);
    const result = await dispatchQueuedNotifications({
      databaseUrl: database.databaseUrl,
      mode: readMode(body),
      limit: parseLimit(readLimit(body), 100, 1, 1000),
    });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: errorMessage(error, "Invalid notification dispatch request") }, { status: 400 });
  }
}

export function readMode(value: unknown): NotificationDispatchMode {
  if (typeof value === "object" && value !== null && "mode" in value) {
    const mode = (value as Record<string, unknown>).mode;
    if (mode === "send") {
      return "send";
    }
  }
  return "dry-run";
}

function readLimit(value: unknown): string | null {
  if (typeof value === "object" && value !== null && "limit" in value) {
    const entry = (value as Record<string, unknown>).limit;
    if (typeof entry === "number" && Number.isInteger(entry)) {
      return String(entry);
    }
    return typeof entry === "string" ? entry : null;
  }
  return null;
}
