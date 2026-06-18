import { matchNotificationRulesForSignals } from "@/lib/notifications/repository";
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

  try {
    const body = await parseOptionalJson(request);
    const since = readString(body, "since") ?? undefined;
    const digestDate = readString(body, "digestDate") ?? undefined;
    const result = await matchNotificationRulesForSignals({
      databaseUrl: database.databaseUrl,
      since,
      digestDate,
      limit: parseLimit(readLimit(body), 100, 1, 1000),
    });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: errorMessage(error, "Invalid notification queue request") }, { status: 400 });
  }
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

function readString(value: unknown, key: string): string | null {
  if (typeof value === "object" && value !== null && key in value) {
    const entry = (value as Record<string, unknown>)[key];
    return typeof entry === "string" && entry.trim() ? entry : null;
  }
  return null;
}
