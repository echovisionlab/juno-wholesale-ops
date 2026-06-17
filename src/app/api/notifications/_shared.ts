import { requireAdmin } from "@/lib/auth/admin";

export async function authorizeNotificationRequest(request: Request): Promise<Response | null> {
  const authorization = await requireAdmin(request);
  return authorization.authorized ? null : authorization.response;
}

export function databaseUrlResponse(): { databaseUrl: string } | { response: Response } {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return { response: Response.json({ error: "DATABASE_URL is not configured" }, { status: 503 }) };
  }
  return { databaseUrl };
}

export async function parseJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new Error("Request body must be valid JSON");
  }
}

export async function parseOptionalJson(request: Request): Promise<unknown> {
  const body = await request.text();
  if (!body.trim()) {
    return {};
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new Error("Request body must be valid JSON");
  }
}

export function readId(value: unknown, label: string): string {
  if (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    value.id.trim()
  ) {
    return value.id;
  }
  throw new Error(`${label} id is required`);
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function parseLimit(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = value ? Number.parseInt(value, 10) : fallback;
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return fallback;
  }
  return parsed;
}
