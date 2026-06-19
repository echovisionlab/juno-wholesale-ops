import { GOOGLE_GMAIL_READONLY_SCOPE, parseScopes } from "@/lib/env";
import { GmailClient } from "@/lib/ingest/gmail";
import { getDelegatedAccessToken, parseServiceAccountKeyJson } from "@/lib/ingest/google-auth";
import type { MailProvider, MailboxSourceInput } from "@/lib/ingest/mail-source";

export type MailSourceConnectionTestResult = {
  ok: boolean;
  status:
    | "connection_ready"
    | "connection_failed"
    | "credential_missing"
    | "invalid_configuration"
    | "provider_not_implemented";
  provider: MailProvider;
  mailboxAddress: string;
  query: string;
  messageCount?: number;
  missing?: string[];
  error?: string;
};

export async function testMailboxSourceConnection(input: MailboxSourceInput): Promise<MailSourceConnectionTestResult> {
  const provider = input.provider;
  const mailboxAddress = input.mailboxAddress?.trim() ?? "";
  const query = input.query?.trim() ?? "";

  if (provider !== "gmail") {
    return {
      ok: false,
      status: "provider_not_implemented",
      provider,
      mailboxAddress,
      query,
      error: `${formatUnsupportedMailProvider(provider)} connection testing is not implemented yet.`,
    };
  }

  const missing = [
    mailboxAddress ? null : "mailbox_address",
    query ? null : "ingest_query",
    input.authType === "google_workspace_delegation" ? null : "google_workspace_delegation",
    input.credentialType === "google_service_account_json" ? null : "google_service_account_json",
  ].filter((value): value is string => Boolean(value));

  if (missing.length > 0) {
    return {
      ok: false,
      status: "invalid_configuration",
      provider,
      mailboxAddress,
      query,
      missing,
    };
  }

  if (!input.credentialSecret?.trim()) {
    return {
      ok: false,
      status: "credential_missing",
      provider,
      mailboxAddress,
      query,
      missing: ["credential_secret"],
    };
  }

  try {
    const key = parseServiceAccountKeyJson(input.credentialSecret);
    const accessToken = await getDelegatedAccessToken({
      key,
      subject: mailboxAddress,
      scopes: parseScopes(GOOGLE_GMAIL_READONLY_SCOPE),
    });
    const gmail = new GmailClient(mailboxAddress, accessToken);
    const messages = await gmail.listMessages(query, Math.min(input.maxResults ?? 10, 10));
    return {
      ok: true,
      status: "connection_ready",
      provider,
      mailboxAddress,
      query,
      messageCount: messages.length,
    };
  } catch (error) {
    return {
      ok: false,
      status: "connection_failed",
      provider,
      mailboxAddress,
      query,
      error: sanitizeMailSourceConnectionError(error),
    };
  }
}

const unsupportedMailProviderLabels: Record<Exclude<MailProvider, "gmail">, string> = {
  imap: "IMAP",
  microsoft_graph: "Microsoft Graph",
  generic: "Generic mailbox",
};

function formatUnsupportedMailProvider(provider: Exclude<MailProvider, "gmail">): string {
  return unsupportedMailProviderLabels[provider];
}

function sanitizeMailSourceConnectionError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "Connection test failed");
  return message
    .replace(/-----BEGIN[\s\S]*?-----END [A-Z ]+-----/g, "[redacted-key]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [redacted-token]")
    .slice(0, 300);
}
