import { loadRuntimeEnv, parseScopes } from "@/lib/env";
import { GmailClient } from "@/lib/ingest/gmail";
import { getDelegatedAccessToken, loadServiceAccountKey } from "@/lib/ingest/google-auth";

async function main() {
  const env = loadRuntimeEnv();
  const key = await loadServiceAccountKey(env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON);
  const accessToken = await getDelegatedAccessToken({
    key,
    subject: env.GOOGLE_WORKSPACE_DELEGATED_USER,
    scopes: parseScopes(env.GOOGLE_GMAIL_SCOPES),
  });
  const gmail = new GmailClient(env.GOOGLE_WORKSPACE_DELEGATED_USER, accessToken);
  const messages = await gmail.listMessages(env.GMAIL_INGEST_QUERY, Math.min(env.GMAIL_MAX_RESULTS, 10));

  console.log(
    JSON.stringify(
      {
        delegatedUser: env.GOOGLE_WORKSPACE_DELEGATED_USER,
        query: env.GMAIL_INGEST_QUERY,
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
