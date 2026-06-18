import { loadRuntimeEnv, parseScopes } from "@/lib/env";
import { GmailClient } from "@/lib/ingest/gmail";
import { getDelegatedAccessToken, loadServiceAccountKey } from "@/lib/ingest/google-auth";
import {
  assertRunnableGmailIngestSettings,
  resolveGmailIngestSettings,
} from "@/lib/ingest/settings";
import { withJunoLiveRepository } from "@/lib/juno-live/repository";

async function main() {
  const env = loadRuntimeEnv();
  const settingsRow = await withJunoLiveRepository(env.DATABASE_URL, (repository) =>
    repository.getServiceSettingsRow(),
  );
  const gmailSettings = resolveGmailIngestSettings(env, settingsRow);
  assertRunnableGmailIngestSettings(gmailSettings);
  const key = await loadServiceAccountKey(gmailSettings.serviceAccountKeyJson);
  const accessToken = await getDelegatedAccessToken({
    key,
    subject: gmailSettings.delegatedUser,
    scopes: parseScopes(gmailSettings.scopes),
  });
  const gmail = new GmailClient(gmailSettings.delegatedUser, accessToken);
  const messages = await gmail.listMessages(gmailSettings.query, Math.min(gmailSettings.maxResults, 10));

  console.log(
    JSON.stringify(
      {
        delegatedUser: gmailSettings.delegatedUser,
        query: gmailSettings.query,
        returnedMessageCount: messages.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
