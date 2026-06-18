import { parseScopes } from "@/lib/env";
import { GmailClient } from "@/lib/ingest/gmail";
import { getDelegatedAccessToken, parseServiceAccountKeyJson } from "@/lib/ingest/google-auth";
import {
  getMissingMailboxSourceSettings,
  getRunnableGmailSources,
  listActiveMailboxSources,
} from "@/lib/ingest/settings";
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
  const sources = await listActiveMailboxSources(database.databaseUrl);
  const gmailSources = getRunnableGmailSources(sources);

  if (sources.length === 0) {
    return Response.json({
      ok: false,
      status: "missing_mail_source",
      missing: ["mail_source"],
      results: [],
    });
  }

  if (gmailSources.length === 0) {
    return Response.json({
      ok: false,
      status: "no_runnable_gmail_source",
      missing: sources.flatMap((source) => getMissingMailboxSourceSettings(source)),
      results: sources.map((source) => ({
        sourceId: source.id,
        mailboxAddress: source.mailboxAddress,
        provider: source.provider,
        credentialConfigured: source.credentialConfigured,
      })),
    });
  }

  const results = [];
  try {
    for (const source of gmailSources) {
      const key = parseServiceAccountKeyJson(source.credentialSecret);
      const accessToken = await getDelegatedAccessToken({
        key,
        subject: source.mailboxAddress,
        scopes: parseScopes(source.scopes),
      });
      const gmail = new GmailClient(source.mailboxAddress, accessToken);
      const messages = await gmail.listMessages(source.query, Math.min(source.maxResults, 10));
      results.push({
        sourceId: source.id,
        mailboxAddress: source.mailboxAddress,
        status: "read_only_smoke_passed",
        messageCount: messages.length,
        query: source.query,
      });
    }

    return Response.json({
      ok: true,
      status: "read_only_smoke_passed",
      results,
    });
  } catch (error: unknown) {
    return Response.json({
      ok: false,
      status: "smoke_failed",
      error: safeSettingsActionError(error),
      results,
    });
  }
}
