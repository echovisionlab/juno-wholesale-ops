import { loadRuntimeEnv } from "@/lib/env";
import { listSsoProviders } from "@/lib/auth/sso-provider-repository";
import { countAdminUsers, ensureServiceSettingsRow } from "@/lib/settings/repository";
import { buildSettingsResponse } from "@/lib/settings/response";
import { buildAppSetupStatus } from "@/lib/setup/status";
import {
  authorizeSettingsRequest,
  databaseUrlResponse,
  getRequestOrigin,
} from "../../_shared";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authorization = await authorizeSettingsRequest(request);
  if (authorization) {
    return authorization;
  }

  const database = databaseUrlResponse();

  const env = loadRuntimeEnv(process.env);
  const settingsRow = await ensureServiceSettingsRow(database.databaseUrl);
  const adminUserCount = await countAdminUsers(database.databaseUrl).catch(() => null);
  const ssoProviders = await listSsoProviders(database.databaseUrl);

  return Response.json({
    settings: buildSettingsResponse({
      env,
      rawEnv: process.env,
      settingsRow,
      nodeEnv: process.env.NODE_ENV ?? "development",
      currentRequestOrigin: getRequestOrigin(request),
      adminUserCount,
      ssoProviders,
    }),
    setup: buildAppSetupStatus({ env, settingsRow, adminUserCount, ssoProviders }),
  });
}
