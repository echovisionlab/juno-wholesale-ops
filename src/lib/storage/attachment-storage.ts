import fs from "node:fs/promises";
import path from "node:path";
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";

export type AttachmentStorageBackend = "local_drive" | "s3_compatible";

export type LocalDriveAttachmentStorage = {
  backend: "local_drive";
  storageDir: string;
};

export type S3CompatibleAttachmentStorage = {
  backend: "s3_compatible";
  endpoint: string;
  bucket: string;
  prefix: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string | null;
  forcePathStyle: boolean;
};

export type AttachmentStorageConfig = LocalDriveAttachmentStorage | S3CompatibleAttachmentStorage;

export type AttachmentStoragePublicConfig =
  | LocalDriveAttachmentStorage
  | Omit<S3CompatibleAttachmentStorage, "secretAccessKey"> & {
      secretConfigured: boolean;
    };

export type AttachmentStorageTestResult = {
  ok: boolean;
  backend: AttachmentStorageBackend;
  target: string;
  error?: string;
};

export async function storeAttachment(options: {
  storage: AttachmentStorageConfig;
  sha256: string;
  filename: string;
  bytes: Buffer;
}): Promise<string> {
  if (options.storage.backend === "local_drive") {
    return storeLocalAttachment(options.storage, options.sha256, options.filename, options.bytes);
  }
  return storeS3Attachment(options.storage, options.sha256, options.filename, options.bytes);
}

export async function testAttachmentStorage(storage: AttachmentStorageConfig): Promise<AttachmentStorageTestResult> {
  if (storage.backend === "local_drive") {
    return testLocalStorage(storage);
  }
  return testS3Storage(storage);
}

export function publicAttachmentStorageConfig(storage: AttachmentStorageConfig): AttachmentStoragePublicConfig {
  if (storage.backend === "local_drive") {
    return storage;
  }
  const { secretAccessKey, ...publicConfig } = storage;
  return {
    ...publicConfig,
    secretConfigured: Boolean(secretAccessKey),
  };
}

export function attachmentStorageTarget(storage: AttachmentStoragePublicConfig | AttachmentStorageConfig): string {
  if (storage.backend === "local_drive") {
    return storage.storageDir;
  }
  return `s3://${storage.bucket}/${normalizeS3Prefix(storage.prefix)}`;
}

export function buildAttachmentObjectKey(options: {
  prefix: string;
  sha256: string;
  filename: string;
}): string {
  const safeFilename = sanitizeAttachmentFilename(options.filename);
  return [
    normalizeS3Prefix(options.prefix),
    options.sha256.slice(0, 2),
    options.sha256.slice(2, 4),
    `${options.sha256}-${safeFilename}`,
  ].filter(Boolean).join("/");
}

export function sanitizeAttachmentFilename(filename: string): string {
  return filename.replace(/[^A-Za-z0-9._-]+/g, "_") || "attachment.xlsx";
}

export function sanitizeStorageError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "Storage check failed");
  return message
    .replace(/AWS4-HMAC-SHA256[^,\s]+/gi, "AWS4-HMAC-SHA256 [redacted]")
    .replace(/Credential=[^,\s]+/gi, "Credential=[redacted]")
    .replace(/Signature=[^,\s]+/gi, "Signature=[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [redacted-token]")
    .slice(0, 300);
}

function normalizeS3Prefix(prefix: string): string {
  return prefix.trim().replace(/^\/+|\/+$/g, "");
}

async function storeLocalAttachment(
  storage: LocalDriveAttachmentStorage,
  sha256: string,
  filename: string,
  bytes: Buffer,
): Promise<string> {
  const safeFilename = sanitizeAttachmentFilename(filename);
  const dir = path.join(storage.storageDir, sha256.slice(0, 2), sha256.slice(2, 4));
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${sha256}-${safeFilename}`);
  await fs.writeFile(filePath, bytes, { flag: "wx" }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") {
      throw error;
    }
  });
  return `file://${path.resolve(filePath)}`;
}

async function storeS3Attachment(
  storage: S3CompatibleAttachmentStorage,
  sha256: string,
  filename: string,
  bytes: Buffer,
): Promise<string> {
  const key = buildAttachmentObjectKey({ prefix: storage.prefix, sha256, filename });
  await createS3Client(storage).send(new PutObjectCommand({
    Bucket: storage.bucket,
    Key: key,
    Body: bytes,
    ContentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    Metadata: {
      sha256,
    },
  }));
  return `s3://${storage.bucket}/${key}`;
}

async function testLocalStorage(storage: LocalDriveAttachmentStorage): Promise<AttachmentStorageTestResult> {
  const probePath = path.join(storage.storageDir, ".storage-probes", `probe-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`);
  try {
    await fs.mkdir(path.dirname(probePath), { recursive: true });
    await fs.writeFile(probePath, "juno-wholesale-ops storage probe", { flag: "wx" });
    await fs.unlink(probePath);
    return {
      ok: true,
      backend: "local_drive",
      target: storage.storageDir,
    };
  } catch (error) {
    return {
      ok: false,
      backend: "local_drive",
      target: storage.storageDir,
      error: sanitizeStorageError(error),
    };
  }
}

async function testS3Storage(storage: S3CompatibleAttachmentStorage): Promise<AttachmentStorageTestResult> {
  const key = [
    normalizeS3Prefix(storage.prefix),
    ".storage-probes",
    `probe-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`,
  ].filter(Boolean).join("/");
  try {
    await createS3Client(storage).send(new PutObjectCommand({
      Bucket: storage.bucket,
      Key: key,
      Body: "juno-wholesale-ops storage probe",
      ContentType: "text/plain",
    }));
    await createS3Client(storage).send(new DeleteObjectCommand({
      Bucket: storage.bucket,
      Key: key,
    }));
    return {
      ok: true,
      backend: "s3_compatible",
      target: `s3://${storage.bucket}/${normalizeS3Prefix(storage.prefix)}`,
    };
  } catch (error) {
    return {
      ok: false,
      backend: "s3_compatible",
      target: `s3://${storage.bucket}/${normalizeS3Prefix(storage.prefix)}`,
      error: sanitizeStorageError(error),
    };
  }
}

function createS3Client(storage: S3CompatibleAttachmentStorage): S3Client {
  if (!storage.secretAccessKey) {
    throw new Error("S3-compatible storage secret access key is required");
  }
  const config: S3ClientConfig = {
    endpoint: storage.endpoint,
    region: storage.region,
    forcePathStyle: storage.forcePathStyle,
    credentials: {
      accessKeyId: storage.accessKeyId,
      secretAccessKey: storage.secretAccessKey,
    },
  };
  return new S3Client(config);
}
