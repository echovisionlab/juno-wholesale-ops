import { loadRuntimeEnv } from "@/lib/env";
import { resolveJunoLiveSettings } from "@/lib/juno-live/settings";
import { ensureServiceSettingsRow } from "@/lib/settings/repository";
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
  const settings = resolveJunoLiveSettings(env, settingsRow);
  const missing = [
    settings.loginEmail ? null : "juno_login_email",
    settings.loginPassword ? null : "juno_login_password",
    settings.delayMinMs <= settings.delayMaxMs ? null : "juno_live_delay_min_ms must be <= juno_live_delay_max_ms",
  ].filter((value): value is string => Boolean(value));

  if (missing.length > 0) {
    return Response.json({
      ok: false,
      status: "missing_settings",
      missing,
      readOnly: true,
    });
  }

  return Response.json({
    ok: true,
    status: "read_only_preflight_passed",
    readOnly: true,
    message: "Credentials and safe delay bounds are configured. The worker will verify the browser session when started.",
  });
}
