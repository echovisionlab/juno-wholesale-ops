import { loadRuntimeEnv } from "@/lib/env";
import { listSsoProviders } from "@/lib/auth/sso-provider-repository";
import { listMailboxSources, redactMailboxSource } from "@/lib/ingest/mail-source";
import { countAdminUsers, ensureServiceSettingsRow, updateServiceSettings } from "@/lib/settings/repository";
import { buildSettingsResponse } from "@/lib/settings/response";
import { validateSettingsPatch } from "@/lib/settings/validation";
import {
  authorizeSettingsRequest,
  databaseUrlResponse,
  getRequestOrigin,
  parseOptionalJson,
  safeSettingsActionError,
} from "./_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authorization = await authorizeSettingsRequest(request);
  if (authorization) {
    return authorization;
  }

  const database = databaseUrlResponse();

  const env = loadRuntimeEnv(process.env);
  const settingsRow = await ensureServiceSettingsRow(database.databaseUrl);
  const adminUserCount = await countAdminUsers(database.databaseUrl).catch(() => null);
  const mailSources = (await listMailboxSources(database.databaseUrl)).map(redactMailboxSource);
  const ssoProviders = await listSsoProviders(database.databaseUrl);
  return Response.json(
    buildSettingsResponse({
      env,
      rawEnv: process.env,
      settingsRow,
      nodeEnv: process.env.NODE_ENV ?? "development",
      currentRequestOrigin: getRequestOrigin(request),
      adminUserCount,
      mailSources,
      ssoProviders,
    }),
  );
}

export async function PATCH(request: Request) {
  const authorization = await authorizeSettingsRequest(request);
  if (authorization) {
    return authorization;
  }

  const database = databaseUrlResponse();

  try {
    const input = await parseOptionalJson(request);
    const env = loadRuntimeEnv(process.env);
    const currentRow = await ensureServiceSettingsRow(database.databaseUrl);
    const ssoProviders = await listSsoProviders(database.databaseUrl);
    const validation = validateSettingsPatch({
      input,
      currentRow,
      env,
      rawEnv: process.env,
      nodeEnv: process.env.NODE_ENV ?? "development",
      ssoProviders,
    });

    if (!validation.ok) {
      return Response.json({ error: "invalid_settings", issues: validation.issues, warnings: validation.warnings }, { status: 400 });
    }

    const settingsRow = validation.changed.length > 0
      ? await updateServiceSettings(database.databaseUrl, validation.patch)
      : currentRow;
    const adminUserCount = await countAdminUsers(database.databaseUrl).catch(() => null);
    const mailSources = (await listMailboxSources(database.databaseUrl)).map(redactMailboxSource);
    const nextSsoProviders = await listSsoProviders(database.databaseUrl);
    const settings = buildSettingsResponse({
      env,
      rawEnv: process.env,
      settingsRow,
      nodeEnv: process.env.NODE_ENV ?? "development",
      currentRequestOrigin: getRequestOrigin(request),
      adminUserCount,
      mailSources,
      ssoProviders: nextSsoProviders,
    });

    return Response.json({
      settings,
      changed: validation.changed,
      warnings: validation.warnings,
    });
  } catch (error: unknown) {
    return Response.json({ error: safeSettingsActionError(error) }, { status: 400 });
  }
}
