import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  resetApplicationTables,
  startMigratedPostgresTestDatabase,
  type StartedPostgresTestDatabase,
} from "@/test/postgres";
import {
  createMailboxSource,
  deleteMailboxSource,
  listActiveMailboxSources,
  listMailboxSources,
  redactMailboxSource,
  updateMailboxSource,
} from "./mail-source";

describe("mail source repository", () => {
  let database: StartedPostgresTestDatabase;
  let databaseUrl: string;

  beforeAll(async () => {
    database = await startMigratedPostgresTestDatabase();
    databaseUrl = database.container.getConnectionUri();
  });

  beforeEach(async () => {
    await resetApplicationTables(database.pool);
  });

  afterAll(async () => {
    await database.stop();
  });

  it("lists default test sources and redacts credential secrets", async () => {
    const sources = await listMailboxSources(databaseUrl);
    const activeSources = await listActiveMailboxSources(databaseUrl);

    expect(sources).toHaveLength(1);
    expect(activeSources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      provider: "gmail",
      credentialConfigured: true,
      mailboxAddress: "operator@example.com",
    });
    expect(redactMailboxSource(sources[0])).toEqual(
      expect.not.objectContaining({ credentialSecret: expect.anything() }),
    );
  });

  it("creates, updates, and disables mailbox sources", async () => {
    const created = await createMailboxSource(databaseUrl, {
      name: "Second Gmail",
      provider: "gmail",
      authType: "google_workspace_delegation",
      credentialType: "google_service_account_json",
      credentialSecret: "{\"client_email\":\"ops@example.com\",\"private_key\":\"key\"}",
      scopes: "https://www.googleapis.com/auth/gmail.modify",
      mailboxAddress: "ops@example.com",
      displayName: "Ops mailbox",
      query: "filename:xlsx",
      maxResults: 50,
      lookbackMs: 86400000,
      processedLabel: "Processed",
      storageDir: ".data/ops-mail",
      attachmentPattern: "xlsx",
      supplierCode: "juno",
    });
    expect(created).toMatchObject({
      name: "Second Gmail",
      mailboxAddress: "ops@example.com",
      maxResults: 50,
      credentialConfigured: true,
      scopes: "https://www.googleapis.com/auth/gmail.readonly",
    });

    const updated = await updateMailboxSource(databaseUrl, {
      id: created.id,
      displayName: "Updated mailbox",
      query: "newer_than:7d filename:xlsx",
      maxResults: 25,
      credentialSecret: "{\"client_email\":\"ops2@example.com\",\"private_key\":\"key\"}",
      scopes: "https://www.googleapis.com/auth/gmail.modify",
    });
    expect(updated).toMatchObject({
      displayName: "Updated mailbox",
      query: "newer_than:7d filename:xlsx",
      maxResults: 25,
      credentialConfigured: true,
      scopes: "https://www.googleapis.com/auth/gmail.readonly",
    });

    await expect(deleteMailboxSource(databaseUrl, created.id)).resolves.toBe(true);
    await expect(listActiveMailboxSources(databaseUrl)).resolves.toHaveLength(1);
    await expect(listMailboxSources(databaseUrl)).resolves.toHaveLength(2);
  });

  it("rejects invalid source shapes", async () => {
    const [existing] = await listMailboxSources(databaseUrl);
    await expect(updateMailboxSource(databaseUrl, { id: existing.id, query: "" })).rejects.toThrow("ingest_query is required");
    await expect(updateMailboxSource(databaseUrl, { id: existing.id, mailboxAddress: "   " })).rejects.toThrow("mailbox_address is required");

    await expect(
      createMailboxSource(databaseUrl, {
        name: "Invalid Gmail",
        provider: "gmail",
        authType: "basic",
        credentialType: "password",
        credentialSecret: "password",
        mailboxAddress: "ops@example.com",
        query: "filename:xlsx",
        storageDir: ".data/mail",
        attachmentPattern: "xlsx",
        supplierCode: "juno",
      }),
    ).rejects.toThrow("Gmail mail sources require Google Workspace delegation");

    await expect(
      createMailboxSource(databaseUrl, {
        name: "Missing credential",
        provider: "imap",
        authType: "basic",
        credentialType: "password",
        mailboxAddress: "ops@example.com",
        query: "filename:xlsx",
        storageDir: ".data/mail",
        attachmentPattern: "xlsx",
        supplierCode: "juno",
      }),
    ).rejects.toThrow("Mail source credential secret or reference is required");

    await expect(updateMailboxSource(databaseUrl, { id: "00000000-0000-4000-8000-000000000000" })).resolves.toBeNull();
    await expect(deleteMailboxSource(databaseUrl, "00000000-0000-4000-8000-000000000000")).resolves.toBe(false);
  });
});
