import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";

const testMinioImage =
  process.env.JUNO_WHOLESALE_OPS_TEST_MINIO_IMAGE ??
  "minio/minio:RELEASE.2025-04-22T22-12-26Z";
const minioPort = 9000;

export type StartedMinioTestStorage = {
  container: StartedTestContainer;
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  stop(): Promise<void>;
};

export async function startMinioTestStorage(): Promise<StartedMinioTestStorage> {
  const bucket = "juno-wholesale-ops-test";
  const region = "us-east-1";
  const accessKeyId = "juno_test_minio";
  const secretAccessKey = "juno-test-minio-secret";
  const container = await new GenericContainer(testMinioImage)
    .withEnvironment({
      MINIO_ROOT_USER: accessKeyId,
      MINIO_ROOT_PASSWORD: secretAccessKey,
    })
    .withCommand(["server", "/data"])
    .withExposedPorts(minioPort)
    .withWaitStrategy(Wait.forHttp("/minio/health/live", minioPort).forStatusCode(200))
    .withStartupTimeout(120000)
    .start();

  const endpoint = `http://${container.getHost()}:${container.getMappedPort(minioPort)}`;
  const client = new S3Client({
    endpoint,
    region,
    forcePathStyle: true,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
  await client.send(new CreateBucketCommand({ Bucket: bucket }));

  return {
    container,
    endpoint,
    bucket,
    region,
    accessKeyId,
    secretAccessKey,
    async stop() {
      await container.stop();
    },
  };
}
