import crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GOOGLE_GMAIL_READONLY_SCOPE } from "@/lib/env";
import { testMailboxSourceConnection } from "./mail-source-test";
import type { MailboxSourceInput } from "./mail-source";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("testMailboxSourceConnection", () => {
  it("rejects provider adapters that cannot be tested yet", async () => {
    await expect(testMailboxSourceConnection(mailSource({ provider: "imap" }))).resolves.toMatchObject({
      ok: false,
      status: "provider_not_implemented",
      error: "IMAP connection testing is not implemented yet.",
    });
    await expect(testMailboxSourceConnection(mailSource({ provider: "microsoft_graph" }))).resolves.toMatchObject({
      ok: false,
      status: "provider_not_implemented",
      error: "Microsoft Graph connection testing is not implemented yet.",
    });
    await expect(testMailboxSourceConnection(mailSource({ provider: "generic" }))).resolves.toMatchObject({
      ok: false,
      status: "provider_not_implemented",
      error: "Generic mailbox connection testing is not implemented yet.",
    });
    await expect(testMailboxSourceConnection(mailSource({
      provider: "imap",
      mailboxAddress: undefined as unknown as string,
      query: undefined as unknown as string,
    }))).resolves.toMatchObject({
      ok: false,
      status: "provider_not_implemented",
      mailboxAddress: "",
      query: "",
    });
  });

  it("reports incomplete Gmail Workspace settings without exposing secrets", async () => {
    await expect(
      testMailboxSourceConnection(mailSource({
        authType: "oauth2",
        credentialType: "oauth_client_secret",
        credentialSecret: "",
        mailboxAddress: "",
        query: "",
      })),
    ).resolves.toEqual({
      ok: false,
      status: "invalid_configuration",
      provider: "gmail",
      mailboxAddress: "",
      query: "",
      missing: ["mailbox_address", "ingest_query", "google_workspace_delegation", "google_service_account_json"],
    });

    await expect(testMailboxSourceConnection(mailSource({ credentialSecret: "" }))).resolves.toMatchObject({
      ok: false,
      status: "credential_missing",
      missing: ["credential_secret"],
    });
  });

  it("runs a read-only Gmail list smoke check", async () => {
    const fetchMock = mockFetch([
      { ok: true, json: { access_token: "access-token" } },
      { ok: true, json: { messages: [{ id: "m1" }, { id: "m2", threadId: "t2" }] } },
      { ok: true, json: { access_token: "access-token" } },
      { ok: true, json: {} },
    ]);

    await expect(testMailboxSourceConnection(mailSource({ scopes: "https://www.googleapis.com/auth/gmail.modify" }))).resolves.toEqual({
      ok: true,
      status: "connection_ready",
      provider: "gmail",
      mailboxAddress: "ops@example.test",
      query: "filename:xlsx",
      messageCount: 2,
    });

    const calls = fetchMock.mock.calls as unknown as Array<[URL | string, RequestInit | undefined]>;
    expect(decodeJwtPayload(readAssertion(calls[0][1])).scope).toBe(GOOGLE_GMAIL_READONLY_SCOPE);
    expect(String(calls[1][0])).toContain("gmail.googleapis.com");
    expect(String(calls[1][0])).toContain("maxResults=10");

    await expect(testMailboxSourceConnection(mailSource({ maxResults: undefined, scopes: undefined }))).resolves.toMatchObject({
      ok: true,
      messageCount: 0,
    });
    expect(String(calls[3][0])).toContain("maxResults=10");
  });

  it("sanitizes failed connection errors", async () => {
    mockFetch([
      { ok: false, status: 400, json: { error: "unauthorized_client", error_description: "Bearer abc.def.ghi rejected" } },
    ]);

    await expect(testMailboxSourceConnection(mailSource())).resolves.toMatchObject({
      ok: false,
      status: "connection_failed",
      error: "Google OAuth token request failed: unauthorized_client Bearer [redacted-token] rejected",
    });

    globalThis.fetch = vi.fn(async () => {
      throw "network down";
    }) as unknown as typeof fetch;
    await expect(testMailboxSourceConnection(mailSource())).resolves.toMatchObject({
      ok: false,
      status: "connection_failed",
      error: "network down",
    });

    globalThis.fetch = vi.fn(async () => {
      throw "";
    }) as unknown as typeof fetch;
    await expect(testMailboxSourceConnection(mailSource())).resolves.toMatchObject({
      ok: false,
      status: "connection_failed",
      error: "Connection test failed",
    });
  });
});

function mailSource(overrides: Partial<MailboxSourceInput> = {}): MailboxSourceInput {
  return {
    name: "Supplier inbox",
    provider: "gmail",
    authType: "google_workspace_delegation",
    credentialType: "google_service_account_json",
    credentialSecret: JSON.stringify({
      client_email: "svc@example.iam.gserviceaccount.com",
      private_key: generatePrivateKey(),
      token_uri: "https://oauth.example/token",
    }),
    credentialReference: null,
    scopes: GOOGLE_GMAIL_READONLY_SCOPE,
    mailboxAddress: "ops@example.test",
    displayName: "Ops",
    providerMailboxId: null,
    query: "filename:xlsx",
    maxResults: 25,
    lookbackMs: 604800000,
    processedLabel: "Wholesale Processed",
    storageDir: ".data/mail",
    attachmentPattern: "xlsx",
    supplierCode: "juno",
    isActive: true,
    ...overrides,
  };
}

function generatePrivateKey() {
  const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  return privateKey.export({ type: "pkcs8", format: "pem" }).toString();
}

function readAssertion(init: RequestInit | undefined): string {
  const body = init?.body;
  if (!(body instanceof URLSearchParams)) {
    throw new Error("Expected OAuth token request body");
  }
  const assertion = body.get("assertion");
  if (!assertion) {
    throw new Error("Expected OAuth assertion");
  }
  return assertion;
}

function decodeJwtPayload(assertion: string): { scope: string } {
  const payload = assertion.split(".")[1];
  if (!payload) {
    throw new Error("Expected JWT payload");
  }
  return JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as { scope: string };
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
