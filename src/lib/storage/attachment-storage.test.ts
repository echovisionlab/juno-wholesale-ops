import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { S3Client } from "@aws-sdk/client-s3";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  attachmentStorageTarget,
  buildAttachmentObjectKey,
  publicAttachmentStorageConfig,
  sanitizeStorageError,
  sanitizeAttachmentFilename,
  storeAttachment,
  testAttachmentStorage,
  type S3CompatibleAttachmentStorage,
} from "./attachment-storage";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("attachment storage", () => {
  it("sanitizes filenames and builds deterministic object keys", () => {
    expect(sanitizeAttachmentFilename("Juno Preorders #1.xlsx")).toBe("Juno_Preorders_1.xlsx");
    expect(sanitizeAttachmentFilename("")).toBe("attachment.xlsx");
    expect(buildAttachmentObjectKey({
      prefix: "/mail-attachments/",
      sha256: "abcdef123456",
      filename: "Juno Preorders #1.xlsx",
    })).toBe("mail-attachments/ab/cd/abcdef123456-Juno_Preorders_1.xlsx");
  });

  it("stores local attachments idempotently", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "juno-storage-"));
    const storage = { backend: "local_drive" as const, storageDir: dir };
    const uri = await storeAttachment({
      storage,
      sha256: "abcdef123456",
      filename: "preorders.xlsx",
      bytes: Buffer.from("xlsx"),
    });

    expect(uri).toBe(`file://${path.join(dir, "ab", "cd", "abcdef123456-preorders.xlsx")}`);
    await expect(storeAttachment({
      storage,
      sha256: "abcdef123456",
      filename: "preorders.xlsx",
      bytes: Buffer.from("xlsx"),
    })).resolves.toBe(uri);
    await expect(testAttachmentStorage(storage)).resolves.toMatchObject({
      ok: true,
      backend: "local_drive",
      target: dir,
    });
    expect(publicAttachmentStorageConfig(storage)).toEqual(storage);
    expect(attachmentStorageTarget(storage)).toBe(dir);
  });

  it("reports local storage failures without throwing from probes", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "juno-storage-"));
    const blockingPath = path.join(dir, "blocked");
    await fs.writeFile(blockingPath, "not a directory");

    await expect(storeAttachment({
      storage: { backend: "local_drive", storageDir: blockingPath },
      sha256: "abcdef123456",
      filename: "preorders.xlsx",
      bytes: Buffer.from("xlsx"),
    })).rejects.toThrow();

    await expect(testAttachmentStorage({ backend: "local_drive", storageDir: blockingPath })).resolves.toMatchObject({
      ok: false,
      backend: "local_drive",
      target: blockingPath,
    });

    const writableDir = await fs.mkdtemp(path.join(os.tmpdir(), "juno-storage-"));
    vi.spyOn(fs, "writeFile").mockRejectedValueOnce(Object.assign(new Error("denied"), { code: "EACCES" }));
    await expect(storeAttachment({
      storage: { backend: "local_drive", storageDir: writableDir },
      sha256: "abcdef123456",
      filename: "preorders.xlsx",
      bytes: Buffer.from("xlsx"),
    })).rejects.toThrow("denied");
  });

  it("stores S3-compatible attachments without exposing the secret", async () => {
    const send = vi.spyOn(S3Client.prototype, "send").mockResolvedValue({} as never);
    const storage = s3Storage();

    await expect(storeAttachment({
      storage,
      sha256: "abcdef123456",
      filename: "preorders.xlsx",
      bytes: Buffer.from("xlsx"),
    })).resolves.toBe("s3://juno-wholesale-ops/mail-attachments/ab/cd/abcdef123456-preorders.xlsx");

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      input: {
        Bucket: "juno-wholesale-ops",
        Key: "mail-attachments/ab/cd/abcdef123456-preorders.xlsx",
      },
    });
    expect(publicAttachmentStorageConfig(storage)).toEqual({
      backend: "s3_compatible",
      endpoint: "http://localhost:29100",
      bucket: "juno-wholesale-ops",
      prefix: "mail-attachments",
      region: "us-east-1",
      accessKeyId: "minio",
      forcePathStyle: true,
      secretConfigured: true,
    });
    expect(attachmentStorageTarget(publicAttachmentStorageConfig(storage))).toBe("s3://juno-wholesale-ops/mail-attachments");
  });

  it("runs S3-compatible write/delete probes", async () => {
    const send = vi.spyOn(S3Client.prototype, "send").mockResolvedValue({} as never);

    await expect(testAttachmentStorage(s3Storage())).resolves.toMatchObject({
      ok: true,
      backend: "s3_compatible",
      target: "s3://juno-wholesale-ops/mail-attachments",
    });
    expect(send).toHaveBeenCalledTimes(2);

    send.mockRejectedValueOnce(new Error("Signature=secret failed"));
    await expect(testAttachmentStorage(s3Storage())).resolves.toMatchObject({
      ok: false,
      backend: "s3_compatible",
      error: "Signature=[redacted] failed",
    });

    await expect(testAttachmentStorage({ ...s3Storage(), secretAccessKey: null })).resolves.toMatchObject({
      ok: false,
      backend: "s3_compatible",
      error: "S3-compatible storage secret access key is required",
    });
  });

  it("sanitizes storage errors", () => {
    expect(sanitizeStorageError("")).toBe("Storage check failed");
    expect(sanitizeStorageError("Bearer abc.def.ghi")).toBe("Bearer [redacted-token]");
    expect(sanitizeStorageError("Credential=minio/secret")).toBe("Credential=[redacted]");
  });
});

function s3Storage(): S3CompatibleAttachmentStorage {
  return {
    backend: "s3_compatible",
    endpoint: "http://localhost:29100",
    bucket: "juno-wholesale-ops",
    prefix: "mail-attachments",
    region: "us-east-1",
    accessKeyId: "minio",
    secretAccessKey: "minio-secret",
    forcePathStyle: true,
  };
}
