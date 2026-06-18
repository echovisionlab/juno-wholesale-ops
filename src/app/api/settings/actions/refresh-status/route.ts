import { loadRuntimeEnv } from "@/lib/env";
import { ensureServiceSettingsRow } from "@/lib/settings/repository";
import { buildSettingsResponse } from "@/lib/settings/response";
import { buildAppSetupStatus } from "@/lib/setup/status";
import {
  authorizeSettingsRequest,
  databaseUrlResponse,
} from "../../_shared";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authorization = await authorizeSettingsRequest(request);
  if (authorization) {
    return authorization;
  }

  const database = databaseUrlResponse();
  if ("response" in database) {
    return database.response;
  }

  const env = loadRuntimeEnv(process.env);
  const settingsRow = await ensureServiceSettingsRow(database.databaseUrl);

  return Response.json({
    settings: buildSettingsResponse({
      env,
      rawEnv: process.env,
      settingsRow,
      nodeEnv: process.env.NODE_ENV ?? "development",
    }),
    setup: buildAppSetupStatus({ env, settingsRow }),
  });
}
