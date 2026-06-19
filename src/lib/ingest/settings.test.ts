import { describe, expect, it } from "vitest";
import { GOOGLE_GMAIL_READONLY_SCOPE } from "@/lib/env";
import {
  assertRunnableGmailMailboxSource,
  getMissingMailboxSourceSettings,
  getRunnableGmailSources,
  redactMailboxSource,
  type MailboxIngestSource,
} from "./settings";

describe("mail source ingest settings", () => {
  it("classifies runnable Gmail sources without exposing credential secrets", () => {
    const source = mailboxSource();

    expect(getRunnableGmailSources([source])).toEqual([source]);
    expect(getMissingMailboxSourceSettings(source)).toEqual([]);
    expect(() => assertRunnableGmailMailboxSource(source)).not.toThrow();
    expect(redactMailboxSource(source)).toEqual(expect.not.objectContaining({ credentialSecret: expect.anything() }));
  });

  it("reports missing source settings and blocks unsupported providers", () => {
    const source = {
      ...mailboxSource(),
      provider: "imap" as const,
      authType: "basic" as const,
      credentialType: "password" as const,
      credentialSecret: null,
      credentialConfigured: false,
      mailboxAddress: "",
      query: "",
    };

    expect(getRunnableGmailSources([source])).toEqual([]);
    expect(getMissingMailboxSourceSettings(source)).toEqual([
      "mailbox_address",
      "ingest_query",
      "credential",
    ]);
    expect(() => assertRunnableGmailMailboxSource(source)).toThrow(
      "Mail provider imap is configured but no ingest adapter is implemented yet",
    );
  });
});

function mailboxSource(): MailboxIngestSource {
  return {
    id: "source-1",
    connectionId: "connection-1",
    name: "Gmail source",
    provider: "gmail",
    authType: "google_workspace_delegation",
    credentialType: "google_service_account_json",
    credentialSecret: "{\"client_email\":\"test@example.com\",\"private_key\":\"key\"}",
    credentialReference: null,
    credentialConfigured: true,
    scopes: GOOGLE_GMAIL_READONLY_SCOPE,
    mailboxAddress: "operator@example.com",
    displayName: "Operator",
    query: "filename:xlsx",
    maxResults: 25,
    lookbackMs: 604800000,
    processedLabel: "Processed",
    storageBackend: "local_drive",
    storageDir: ".data/mail",
    storageEndpoint: "",
    storageBucket: "",
    storagePrefix: "mail-attachments",
    storageRegion: "us-east-1",
    storageAccessKeyId: "",
    storageSecret: null,
    storageSecretConfigured: false,
    storageForcePathStyle: true,
    attachmentPattern: "xlsx",
    supplierCode: "juno",
    isActive: true,
  };
}
