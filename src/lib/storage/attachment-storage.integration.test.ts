import crypto from "node:crypto";
import { HeadObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { GOOGLE_GMAIL_READONLY_SCOPE } from "@/lib/env";
import { testMailboxSourceConnection } from "@/lib/ingest/mail-source-test";
import { startMinioTestStorage, type StartedMinioTestStorage } from "@/test/minio";
import {
  buildAttachmentObjectKey,
  storeAttachment,
  testAttachmentStorage,
  type S3CompatibleAttachmentStorage,
} from "./attachment-storage";

const originalFetch = globalThis.fetch;

describe("attachment storage MinIO integration", () => {
  let minio: StartedMinioTestStorage;
  let client: S3Client;

  beforeAll(async () => {
    minio = await startMinioTestStorage();
    client = new S3Client({
      endpoint: minio.endpoint,
      region: minio.region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: minio.accessKeyId,
        secretAccessKey: minio.secretAccessKey,
      },
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await minio.stop();
  });

  it("stores attachments in actual MinIO and leaves no probe objects", async () => {
    const storage = minioStorage(minio);
    const sha256 = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
    const filename = "Juno Wholesale Sample #1.xlsx";
    const bytes = Buffer.from("synthetic xlsx bytes");
    const key = buildAttachmentObjectKey({
      prefix: storage.prefix,
      sha256,
      filename,
    });

    await expect(storeAttachment({
      storage,
      sha256,
      filename,
      bytes,
    })).resolves.toBe(`s3://${minio.bucket}/${key}`);

    await expect(client.send(new HeadObjectCommand({
      Bucket: minio.bucket,
      Key: key,
    }))).resolves.toMatchObject({
      ContentLength: bytes.byteLength,
      Metadata: { sha256 },
    });

    await expect(testAttachmentStorage(storage)).resolves.toMatchObject({
      ok: true,
      backend: "s3_compatible",
      target: `s3://${minio.bucket}/${storage.prefix}`,
    });

    await expect(client.send(new ListObjectsV2Command({
      Bucket: minio.bucket,
      Prefix: `${storage.prefix}/.storage-probes/`,
    }))).resolves.toMatchObject({
      KeyCount: 0,
    });
  });

  it("marks a Gmail mail source ready only after the S3-compatible storage probe succeeds", async () => {
    mockFetch([
      { ok: true, json: { access_token: "access-token" } },
      { ok: true, json: { messages: [{ id: "m1" }] } },
    ]);

    await expect(testMailboxSourceConnection({
      name: "Supplier inbox",
      provider: "gmail",
      authType: "google_workspace_delegation",
      credentialType: "google_service_account_json",
      credentialSecret: JSON.stringify({
        client_email: "svc@example.iam.gserviceaccount.com",
        private_key: generatePrivateKey(),
        token_uri: "https://oauth.example/token",
      }),
      scopes: GOOGLE_GMAIL_READONLY_SCOPE,
      mailboxAddress: "ops@example.test",
      displayName: "Ops",
      query: "filename:xlsx",
      maxResults: 25,
      lookbackMs: 604800000,
      processedLabel: "Wholesale Processed",
      storageBackend: "s3_compatible",
      storageEndpoint: minio.endpoint,
      storageBucket: minio.bucket,
      storagePrefix: "mail-source-probes",
      storageRegion: minio.region,
      storageAccessKeyId: minio.accessKeyId,
      storageSecret: minio.secretAccessKey,
      storageForcePathStyle: true,
      attachmentPattern: "xlsx",
      supplierCode: "juno",
      isActive: true,
    })).resolves.toMatchObject({
      ok: true,
      status: "connection_ready",
      storage: {
        ok: true,
        backend: "s3_compatible",
        target: `s3://${minio.bucket}/mail-source-probes`,
      },
      messageCount: 1,
    });
  });
});

function minioStorage(minio: StartedMinioTestStorage): S3CompatibleAttachmentStorage {
  return {
    backend: "s3_compatible",
    endpoint: minio.endpoint,
    bucket: minio.bucket,
    prefix: "integration/mail",
    region: minio.region,
    accessKeyId: minio.accessKeyId,
    secretAccessKey: minio.secretAccessKey,
    forcePathStyle: true,
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
