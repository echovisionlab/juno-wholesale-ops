import { requireAdmin } from "@/lib/auth/admin";
import { getDatabaseUrl, loadRuntimeEnv } from "@/lib/env";
import { listMailboxSources, redactMailboxSource } from "@/lib/ingest/mail-source";
import { listSsoProviders } from "@/lib/auth/sso-provider-repository";
import { countAdminUsers, ensureServiceSettingsRow } from "@/lib/settings/repository";
import { buildSettingsResponse } from "@/lib/settings/response";
import type { SettingsResponse } from "@/lib/settings/descriptors";

export async function authorizeSettingsRequest(request: Request): Promise<Response | null> {
  const authorization = await requireAdmin(request);
  return authorization.authorized ? null : authorization.response;
}

export function databaseUrlResponse(): { databaseUrl: string } {
  return { databaseUrl: getDatabaseUrl() };
}

export async function loadSettingsResponse(databaseUrl: string, request?: Request): Promise<SettingsResponse> {
  const env = loadRuntimeEnv(process.env);
  const settingsRow = await ensureServiceSettingsRow(databaseUrl);
  const adminUserCount = await countAdminUsers(databaseUrl).catch(() => null);
  const mailSources = (await listMailboxSources(databaseUrl)).map(redactMailboxSource);
  const ssoProviders = await listSsoProviders(databaseUrl);
  return buildSettingsResponse({
    env,
    rawEnv: process.env,
    settingsRow,
    nodeEnv: process.env.NODE_ENV ?? "development",
    currentRequestOrigin: request ? getRequestOrigin(request) : null,
    adminUserCount,
    mailSources,
    ssoProviders,
  });
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

export function safeSettingsActionError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "settings action failed";
  }
  const message = error.message.replace(/\{[^{}]*(?:private_key|client_email|token|password|secret)[^{}]*\}/gi, "[redacted]");
  return message.length > 240 ? `${message.slice(0, 237)}...` : message;
}

export function getRequestOrigin(request: Request): string {
  const url = new URL(request.url);
  const forwardedProto = firstForwardedHeader(request.headers.get("x-forwarded-proto"));
  const forwardedHost = firstForwardedHeader(request.headers.get("x-forwarded-host"));
  const host = forwardedHost ?? request.headers.get("host") ?? url.host;
  const proto = forwardedProto ?? url.protocol.replace(/:$/, "");
  return `${proto}://${host}`;
}

function firstForwardedHeader(value: string | null): string | null {
  return value?.split(",")[0]?.trim() || null;
}
