import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireAdmin } from "@/lib/auth/admin";
import { getGmailIngestState } from "@/lib/ingest/repository";
import { enqueueLiveLookupJobs, withJunoLiveRepository } from "@/lib/juno-live/repository";
import { getJunoLiveWorkerProcessManager } from "@/lib/juno-live/worker-process";
import { POST as enqueueLiveLookups } from "./live-lookups/enqueue/route";
import { GET as getLiveLookupStatus } from "./live-lookups/status/route";
import {
  GET as getLiveLookupWorker,
  POST as postLiveLookupWorker,
} from "./live-lookups/worker/route";
import { GET as getIngestStatus } from "./ingest/status/route";
import { GET as getSettingsStatus } from "./settings/status/route";

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: vi.fn(),
}));

vi.mock("@/lib/ingest/repository", () => ({
  getGmailIngestState: vi.fn(),
}));

vi.mock("@/lib/juno-live/repository", () => ({
  enqueueLiveLookupJobs: vi.fn(),
  withJunoLiveRepository: vi.fn(),
}));

vi.mock("@/lib/juno-live/worker-process", () => ({
  getJunoLiveWorkerProcessManager: vi.fn(),
}));

const requireAdminMock = vi.mocked(requireAdmin);
const getGmailIngestStateMock = vi.mocked(getGmailIngestState);
const enqueueLiveLookupJobsMock = vi.mocked(enqueueLiveLookupJobs);
const withJunoLiveRepositoryMock = vi.mocked(withJunoLiveRepository);
const getJunoLiveWorkerProcessManagerMock = vi.mocked(getJunoLiveWorkerProcessManager);

describe("admin guarded API routes", () => {
  const repository = {
    getServiceSettingsRow: vi.fn(async () => null),
    getSummary: vi.fn(async () => ({ queued: 2 })),
  };
  const manager = {
    getStatus: vi.fn(() => ({ state: "stopped" })),
    start: vi.fn(() => ({ state: "running" })),
    stopAndWait: vi.fn(async () => ({ state: "stopped" })),
    restart: vi.fn(async () => ({ state: "running", restarts: 1 })),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("DATABASE_URL", "");
    requireAdminMock.mockResolvedValue({ authorized: true, enabled: false, user: null });
    withJunoLiveRepositoryMock.mockImplementation(async (_databaseUrl, callback) =>
      callback(repository as never, {} as never),
    );
    getJunoLiveWorkerProcessManagerMock.mockReturnValue(manager as never);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects protected routes before side effects when admin authorization fails", async () => {
    requireAdminMock.mockResolvedValue({
      authorized: false,
      response: Response.json({ error: "admin_required" }, { status: 403 }),
    });

    await expectStatus(getIngestStatus(request()), 403);
    await expectStatus(getSettingsStatus(request()), 403);
    await expectStatus(getLiveLookupStatus(request()), 403);
    await expectStatus(getLiveLookupWorker(request()), 403);
    await expectStatus(postLiveLookupWorker(jsonRequest({ action: "start" })), 403);
    await expectStatus(enqueueLiveLookups(jsonRequest({ limit: 10 })), 403);

    expect(getGmailIngestStateMock).not.toHaveBeenCalled();
    expect(withJunoLiveRepositoryMock).not.toHaveBeenCalled();
    expect(getJunoLiveWorkerProcessManagerMock).not.toHaveBeenCalled();
    expect(enqueueLiveLookupJobsMock).not.toHaveBeenCalled();
  });

  it("returns ingest state only after admin authorization and database configuration", async () => {
    await expect(expectJson(getIngestStatus(request()))).resolves.toEqual({
      status: 503,
      body: { error: "DATABASE_URL is not configured" },
    });

    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/app");
    getGmailIngestStateMock.mockResolvedValue({ lastQueryStatus: "succeeded" } as never);

    await expect(expectJson(getIngestStatus(request()))).resolves.toEqual({
      status: 200,
      body: { state: { lastQueryStatus: "succeeded" } },
    });
    expect(getGmailIngestStateMock).toHaveBeenCalledWith("postgres://user:pass@localhost:5432/app");
  });

  it("builds settings status with or without database-backed overrides", async () => {
    await expect(expectJson(getSettingsStatus(request()))).resolves.toMatchObject({
      status: 200,
      body: {
        setup: {
          ready: false,
        },
      },
    });
    expect(withJunoLiveRepositoryMock).not.toHaveBeenCalled();

    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/app");

    await expect(expectJson(getSettingsStatus(request()))).resolves.toMatchObject({
      status: 200,
      body: {
        setup: {
          steps: expect.any(Array),
        },
      },
    });
    expect(repository.getServiceSettingsRow).toHaveBeenCalled();
  });

  it("returns live lookup summary only when database state is configured", async () => {
    await expect(expectJson(getLiveLookupStatus(request()))).resolves.toEqual({
      status: 200,
      body: { summary: null },
    });

    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/app");

    await expect(expectJson(getLiveLookupStatus(request()))).resolves.toEqual({
      status: 200,
      body: { summary: { queued: 2 } },
    });
    expect(repository.getSummary).toHaveBeenCalled();
  });

  it("guards and dispatches live worker control actions", async () => {
    await expect(expectJson(getLiveLookupWorker(request()))).resolves.toEqual({
      status: 200,
      body: { worker: { state: "stopped" } },
    });
    await expect(expectJson(postLiveLookupWorker(jsonRequest({ action: "start" })))).resolves.toEqual({
      status: 200,
      body: { worker: { state: "running" } },
    });
    await expect(expectJson(postLiveLookupWorker(jsonRequest({ action: "stop" })))).resolves.toEqual({
      status: 200,
      body: { worker: { state: "stopped" } },
    });
    await expect(expectJson(postLiveLookupWorker(jsonRequest({ action: "restart" })))).resolves.toEqual({
      status: 200,
      body: { worker: { state: "running", restarts: 1 } },
    });
    await expect(expectJson(postLiveLookupWorker(jsonRequest({ action: "pause" })))).resolves.toEqual({
      status: 400,
      body: { error: "action must be start, stop, or restart" },
    });
    await expect(
      expectJson(
        postLiveLookupWorker(
          new Request("http://app.test/api/live-lookups/worker", {
            method: "POST",
            body: "{",
          }),
        ),
      ),
    ).resolves.toEqual({
      status: 400,
      body: { error: "action must be start, stop, or restart" },
    });

    expect(manager.start).toHaveBeenCalledTimes(1);
    expect(manager.stopAndWait).toHaveBeenCalledTimes(1);
    expect(manager.restart).toHaveBeenCalledTimes(1);
  });

  it("enqueues live lookup jobs with conservative parsing fallbacks", async () => {
    await expect(expectJson(enqueueLiveLookups(jsonRequest({ limit: 10 })))).resolves.toEqual({
      status: 503,
      body: { error: "DATABASE_URL is not configured" },
    });

    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/app");
    enqueueLiveLookupJobsMock.mockResolvedValue({ enqueued: 3, skipped: 1 } as never);

    await expect(expectJson(
      enqueueLiveLookups(jsonRequest({ snapshotId: "snapshot-1", limit: "15" })),
    )).resolves.toEqual({
      status: 200,
      body: { enqueued: 3, skipped: 1 },
    });
    expect(enqueueLiveLookupJobsMock).toHaveBeenLastCalledWith({
      databaseUrl: "postgres://user:pass@localhost:5432/app",
      snapshotId: "snapshot-1",
      limit: 15,
      maxAttempts: 2,
    });

    await expect(
      expectJson(enqueueLiveLookups(jsonRequest({ snapshotId: 123, limit: "not-a-number" }))),
    ).resolves.toEqual({
      status: 200,
      body: { enqueued: 3, skipped: 1 },
    });
    expect(enqueueLiveLookupJobsMock).toHaveBeenLastCalledWith({
      databaseUrl: "postgres://user:pass@localhost:5432/app",
      snapshotId: null,
      limit: 1000,
      maxAttempts: 2,
    });

    await expect(expectJson(enqueueLiveLookups(jsonRequest({ limit: "-1" })))).resolves.toEqual({
      status: 200,
      body: { enqueued: 3, skipped: 1 },
    });
    expect(enqueueLiveLookupJobsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ limit: 1000 }),
    );
  });

  it("falls back to default enqueue options when the request body is not JSON", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/app");
    enqueueLiveLookupJobsMock.mockResolvedValue({ enqueued: 0, skipped: 0 } as never);

    await expect(
      expectJson(
        enqueueLiveLookups(
          new Request("http://app.test/api/live-lookups/enqueue", {
            method: "POST",
            body: "{",
          }),
        ),
      ),
    ).resolves.toEqual({
      status: 200,
      body: { enqueued: 0, skipped: 0 },
    });
    expect(enqueueLiveLookupJobsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        snapshotId: null,
        limit: 1000,
      }),
    );
  });
});

function request(): Request {
  return new Request("http://app.test/api/protected");
}

function jsonRequest(body: unknown): Request {
  return new Request("http://app.test/api/protected", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function expectStatus(responsePromise: Promise<Response>, status: number): Promise<void> {
  await expect(responsePromise.then((response) => response.status)).resolves.toBe(status);
}

async function expectJson(responsePromise: Promise<Response>): Promise<{ status: number; body: unknown }> {
  const response = await responsePromise;
  return {
    status: response.status,
    body: await response.json(),
  };
}
