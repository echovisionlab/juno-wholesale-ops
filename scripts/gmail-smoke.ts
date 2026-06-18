import { loadRuntimeEnv, parseScopes } from "@/lib/env";
import { GmailClient } from "@/lib/ingest/gmail";
import { getDelegatedAccessToken, parseServiceAccountKeyJson } from "@/lib/ingest/google-auth";
import {
  assertRunnableGmailMailboxSource,
  getRunnableGmailSources,
  listActiveMailboxSources,
} from "@/lib/ingest/settings";

async function main() {
  const env = loadRuntimeEnv();
  const sources = await listActiveMailboxSources(env.DATABASE_URL);
  const gmailSources = getRunnableGmailSources(sources);
  if (sources.length === 0) {
    throw new Error("No active mail sources are configured.");
  }
  if (gmailSources.length === 0) {
    throw new Error("No runnable Gmail mailbox sources are configured.");
  }

  const results = [];
  for (const source of gmailSources) {
    assertRunnableGmailMailboxSource(source);
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
      query: source.query,
      returnedMessageCount: messages.length,
    });
  }

  console.log(
    JSON.stringify(
      {
        sourceCount: gmailSources.length,
        results,
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
