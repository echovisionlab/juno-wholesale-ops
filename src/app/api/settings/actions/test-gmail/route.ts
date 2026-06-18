import { loadRuntimeEnv, parseScopes } from "@/lib/env";
import { GmailClient } from "@/lib/ingest/gmail";
import { getDelegatedAccessToken, loadServiceAccountKey } from "@/lib/ingest/google-auth";
import { getMissingGmailIngestSettings, resolveGmailIngestSettings } from "@/lib/ingest/settings";
import { ensureServiceSettingsRow } from "@/lib/settings/repository";
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

  const database = databaseUrlResponse();
  if ("response" in database) {
    return database.response;
  }

  const env = loadRuntimeEnv(process.env);
  const settingsRow = await ensureServiceSettingsRow(database.databaseUrl);
  const settings = resolveGmailIngestSettings(env, settingsRow);
  const missing = getMissingGmailIngestSettings(settings);

  if (missing.length > 0) {
    return Response.json({
      ok: false,
      status: "missing_settings",
      missing,
      query: settings.query,
    });
  }

  try {
    if (!settings.serviceAccountKeyJson || !settings.delegatedUser) {
      return Response.json({
        ok: false,
        status: "missing_settings",
        missing: missing.length > 0 ? missing : ["google_workspace_delegated_user", "google_service_account_key_json"],
        query: settings.query,
      });
    }

    const key = await loadServiceAccountKey(settings.serviceAccountKeyJson);
    const accessToken = await getDelegatedAccessToken({
      key,
      subject: settings.delegatedUser,
      scopes: parseScopes(settings.scopes),
    });
    const gmail = new GmailClient(settings.delegatedUser, accessToken);
    const messages = await gmail.listMessages(settings.query, Math.min(settings.maxResults, 10));

    return Response.json({
      ok: true,
      status: "read_only_smoke_passed",
      messageCount: messages.length,
      query: settings.query,
    });
  } catch (error: unknown) {
    return Response.json({
      ok: false,
      status: "smoke_failed",
      error: safeSettingsActionError(error),
      query: settings.query,
    });
  }
}
