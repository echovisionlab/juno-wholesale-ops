import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDelegatedAccessToken, loadServiceAccountKey } from "./google-auth";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("loadServiceAccountKey", () => {
  it("loads valid service account JSON", async () => {
    const file = await writeTempJson({
      client_email: "svc@example.iam.gserviceaccount.com",
      private_key: "key",
      token_uri: "https://oauth.example/token",
    });

    await expect(loadServiceAccountKey(file)).resolves.toEqual({
      client_email: "svc@example.iam.gserviceaccount.com",
      private_key: "key",
      token_uri: "https://oauth.example/token",
    });
  });

  it("rejects incomplete service account JSON", async () => {
    const file = await writeTempJson({ client_email: "svc@example.iam.gserviceaccount.com" });

    await expect(loadServiceAccountKey(file)).rejects.toThrow("Invalid service account key JSON");
  });
});

describe("getDelegatedAccessToken", () => {
  it("signs a delegated JWT and returns the access token", async () => {
    const privateKey = generatePrivateKey();
    const fetchMock = mockTokenFetch({ ok: true, json: { access_token: "access-token" } });

    await expect(
      getDelegatedAccessToken({
        key: {
          client_email: "svc@example.iam.gserviceaccount.com",
          private_key: privateKey,
          token_uri: "https://oauth.example/token",
        },
        subject: "state303@dsub.io",
        scopes: ["scope-a", "scope-b"],
      }),
    ).resolves.toBe("access-token");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://oauth.example/token",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
      }),
    );
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit | undefined]>;
    const body = calls[0][1]?.body as URLSearchParams;
    expect(body.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    expect(body.get("assertion")?.split(".")).toHaveLength(3);
  });

  it("uses the default token URI and surfaces OAuth errors", async () => {
    const privateKey = generatePrivateKey();
    mockTokenFetch({
      ok: false,
      status: 400,
      json: { error: "unauthorized_client", error_description: "delegation missing" },
    });

    await expect(
      getDelegatedAccessToken({
        key: {
          client_email: "svc@example.iam.gserviceaccount.com",
          private_key: privateKey,
        },
        subject: "state303@dsub.io",
        scopes: ["scope-a"],
      }),
    ).rejects.toThrow("Google OAuth token request failed: unauthorized_client delegation missing");
  });

  it("rejects a successful response without an access token", async () => {
    const privateKey = generatePrivateKey();
    mockTokenFetch({ ok: true, json: {} });

    await expect(
      getDelegatedAccessToken({
        key: {
          client_email: "svc@example.iam.gserviceaccount.com",
          private_key: privateKey,
        },
        subject: "state303@dsub.io",
        scopes: ["scope-a"],
      }),
    ).rejects.toThrow("Google OAuth token request failed: 200");
  });
});

async function writeTempJson(value: unknown) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wholesale-auth-"));
  const file = path.join(dir, "key.json");
  await fs.writeFile(file, JSON.stringify(value), "utf8");
  return file;
}

function generatePrivateKey() {
  const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  return privateKey.export({ type: "pkcs8", format: "pem" }).toString();
}

function mockTokenFetch(response: {
  ok: boolean;
  status?: number;
  json: unknown;
}) {
  const fetchMock = vi.fn(async () => {
    return {
      ok: response.ok,
      status: response.status ?? 200,
      json: async () => response.json,
    } as Response;
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
