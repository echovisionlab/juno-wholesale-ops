import crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GOOGLE_GMAIL_MODIFY_SCOPE, GOOGLE_GMAIL_READONLY_SCOPE } from "@/lib/env";
import type { RunnableGmailMailboxSource } from "@/lib/ingest/mail-source";
import {
  buildMessageRecord,
  maxIso,
  runGmailIngest,
  type GmailIngestClient,
} from "./gmail-ingest-runner";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("Gmail ingest runner", () => {
  it("rejects missing sources, unsupported adapters, and label mode without modify scope", async () => {
    await expect(runGmailIngest({
      databaseUrl: "postgres://unused",
      sources: [],
      writeMode: false,
      labelMode: false,
      liveSettings: { enqueueOnIngest: false, maxAttempts: 3 },
    })).rejects.toThrow("No active mail sources are configured");

    await expect(runGmailIngest({
      databaseUrl: "postgres://unused",
      sources: [{ ...source(), provider: "imap", authType: "basic", credentialType: "password" }],
      writeMode: false,
      labelMode: false,
      liveSettings: { enqueueOnIngest: false, maxAttempts: 3 },
    })).rejects.toThrow("No runnable mail sources are configured");

    await expect(runGmailIngest({
      databaseUrl: "postgres://unused",
      sources: [source()],
      writeMode: false,
      labelMode: true,
      liveSettings: { enqueueOnIngest: false, maxAttempts: 3 },
      dependencies: { createGmailClient: async () => fakeGmailClient() },
    })).rejects.toThrow("Gmail label mode requires write mode");

    await expect(runGmailIngest({
      databaseUrl: "postgres://unused",
      sources: [source()],
      writeMode: true,
      labelMode: true,
      liveSettings: { enqueueOnIngest: false, maxAttempts: 3 },
      dependencies: { createGmailClient: async () => fakeGmailClient() },
    })).rejects.toThrow(GOOGLE_GMAIL_MODIFY_SCOPE);
  });

  it("runs dry-run mode with the default read-only Gmail client factory", async () => {
    const fetchMock = mockFetch([
      { ok: true, json: { access_token: "access-token" } },
      { ok: true, json: {} },
    ]);

    await expect(runGmailIngest({
      databaseUrl: "postgres://unused",
      sources: [source({ credentialSecret: JSON.stringify({
        client_email: "svc@example.iam.gserviceaccount.com",
        private_key: generatePrivateKey(),
        token_uri: "https://oauth.example/token",
      }) })],
      writeMode: false,
      labelMode: false,
      liveSettings: { enqueueOnIngest: false, maxAttempts: 3 },
    })).resolves.toMatchObject({
      dryRun: true,
      sourceCount: 1,
      totals: {
        messages: 0,
        attachments: 0,
      },
    });

    const calls = fetchMock.mock.calls as unknown as Array<[URL | string, RequestInit | undefined]>;
    expect(String(calls[1][0])).toContain("gmail.googleapis.com");
  });

  it("surfaces dry-run Gmail client errors without write-mode state updates", async () => {
    await expect(runGmailIngest({
      databaseUrl: "postgres://unused",
      sources: [source()],
      writeMode: false,
      labelMode: false,
      liveSettings: { enqueueOnIngest: false, maxAttempts: 3 },
      dependencies: {
        createGmailClient: async () => ({
          ...fakeGmailClient(),
          async listMessages() {
            throw new Error("dry-run failed");
          },
        }),
      },
    })).rejects.toThrow("dry-run failed");
  });

  it("handles inline attachment data, skipped empty attachments, and message fallbacks without dry-run writes", async () => {
    const inlineBytes = Buffer.from("not a workbook");
    const client = fakeGmailClient({
      messages: [
        {
          id: "message-inline",
          payload: {
            headers: [],
            parts: [
              {
                filename: "inline.xlsx",
                mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                body: {
                  data: inlineBytes.toString("base64url"),
                  size: inlineBytes.byteLength,
                },
              },
              {
                filename: "empty.xlsx",
                mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                body: { size: 0 },
              },
            ],
          },
        },
      ],
    });
    const addLabel = vi.spyOn(client, "addLabel");
    const storeAttachment = vi.fn(async () => "memory://inline.xlsx");

    await expect(runGmailIngest({
      databaseUrl: "postgres://unused",
      sources: [source()],
      writeMode: false,
      labelMode: false,
      liveSettings: { enqueueOnIngest: false, maxAttempts: 3 },
      dependencies: {
        createGmailClient: async () => client,
        storeAttachment,
        parseCatalog: async () => ({
          kind: "unknown",
          sheetName: "Inline",
          catalogDate: null,
          contentHash: "inline-content-hash",
          rowCount: 0,
          items: [],
        }),
      },
    })).resolves.toMatchObject({
      labelMode: false,
      totals: {
        messages: 1,
        attachments: 1,
        parsedRows: 0,
      },
      sources: [
        {
          lastSuccessfulMessageReceivedAt: null,
          results: [
            {
              messageId: "message-inline",
              rfc822MessageId: null,
              receivedAt: null,
              storageUri: null,
            },
          ],
        },
      ],
    });
    expect(storeAttachment).not.toHaveBeenCalled();
    expect(addLabel).not.toHaveBeenCalled();
    expect(buildMessageRecord(source(), { id: "message-no-date" })).toMatchObject({
      providerThreadId: null,
      receivedAt: null,
      subject: null,
      toAddresses: [],
      deliveredTo: [],
    });
    expect(maxIso("2026-06-20T00:00:00.000Z", null)).toBe("2026-06-20T00:00:00.000Z");
    expect(maxIso("2026-06-20T00:00:00.000Z", "2026-06-19T00:00:00.000Z")).toBe(
      "2026-06-20T00:00:00.000Z",
    );
    expect(maxIso("2026-06-19T00:00:00.000Z", "2026-06-20T00:00:00.000Z")).toBe(
      "2026-06-20T00:00:00.000Z",
    );
  });
});

function source(overrides: Partial<RunnableGmailMailboxSource> = {}): RunnableGmailMailboxSource {
  return {
    id: "source-1",
    connectionId: "connection-1",
    name: "Gmail source",
    provider: "gmail",
    authType: "google_workspace_delegation",
    credentialType: "google_service_account_json",
    credentialSecret: "{\"client_email\":\"synthetic@example.test\"}",
    credentialReference: null,
    credentialConfigured: true,
    scopes: GOOGLE_GMAIL_READONLY_SCOPE,
    mailboxAddress: "ops@example.test",
    displayName: "Ops",
    query: "filename:xlsx",
    maxResults: 10,
    lookbackMs: 604800000,
    processedLabel: "Wholesale Processed",
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
    ...overrides,
  };
}

function fakeGmailClient(options: { messages?: Awaited<ReturnType<GmailIngestClient["getMessage"]>>[] } = {}): GmailIngestClient {
  const messages = options.messages ?? [];
  return {
    async listMessages() {
      return messages.map((message) => ({ id: message.id, threadId: message.threadId }));
    },
    async getMessage(messageId: string) {
      const message = messages.find((candidate) => candidate.id === messageId);
      if (!message) {
        throw new Error(`Missing fake Gmail message ${messageId}`);
      }
      return message;
    },
    async getAttachment() {
      return Buffer.from("attachment");
    },
    async addLabel() {},
    async getOrCreateLabel() {
      return "label-1";
    },
  };
}

function generatePrivateKey() {
  const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  return privateKey.export({ type: "pkcs8", format: "pem" }).toString();
}

function mockFetch(
  responses: Array<{
    ok: boolean;
    status?: number;
    json: unknown;
  }>,
) {
  const fetchMock = vi.fn(async () => {
    const response = responses.shift();
    if (!response) {
      throw new Error("Unexpected fetch");
    }
    return {
      ok: response.ok,
      status: response.status ?? 200,
      json: async () => response.json,
    } as Response;
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
