import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireAdmin } from "@/lib/auth/admin";
import { getGmailIngestState } from "@/lib/ingest/repository";
import {
  createWatchRule,
  deleteWatchRule,
  getTodaySignals,
  listWatchRules,
  updateWatchRule,
} from "@/lib/insights/repository";
import { getMovementSignals } from "@/lib/insights/movement-repository";
import { getCatalogTrends, getInsightDigest } from "@/lib/insights/trend-repository";
import { enqueueLiveLookupJobs, withJunoLiveRepository } from "@/lib/juno-live/repository";
import { getJunoLiveWorkerProcessManager } from "@/lib/juno-live/worker-process";
import { POST as enqueueLiveLookups } from "./live-lookups/enqueue/route";
import { GET as getLiveLookupStatus } from "./live-lookups/status/route";
import {
  GET as getLiveLookupWorker,
  POST as postLiveLookupWorker,
} from "./live-lookups/worker/route";
import { GET as getIngestStatus } from "./ingest/status/route";
import { GET as getTodayInsights } from "./insights/today/route";
import { GET as getDigestInsights } from "./insights/digest/route";
import { GET as getMovementInsights } from "./insights/movement/route";
import { GET as getTrendInsights } from "./insights/trends/route";
import { GET as getSettingsStatus } from "./settings/status/route";
import {
  DELETE as deleteWatchRules,
  GET as getWatchRules,
  PATCH as patchWatchRules,
  POST as postWatchRules,
} from "./watch-rules/route";

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: vi.fn(),
}));

vi.mock("@/lib/ingest/repository", () => ({
  getGmailIngestState: vi.fn(),
}));

vi.mock("@/lib/insights/repository", () => ({
  createWatchRule: vi.fn(),
  deleteWatchRule: vi.fn(),
  getTodaySignals: vi.fn(),
  listWatchRules: vi.fn(),
  updateWatchRule: vi.fn(),
}));

vi.mock("@/lib/insights/movement-repository", () => ({
  getMovementSignals: vi.fn(),
}));

vi.mock("@/lib/insights/trend-repository", () => ({
  getCatalogTrends: vi.fn(),
  getInsightDigest: vi.fn(),
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
const getTodaySignalsMock = vi.mocked(getTodaySignals);
const getMovementSignalsMock = vi.mocked(getMovementSignals);
const getCatalogTrendsMock = vi.mocked(getCatalogTrends);
const getInsightDigestMock = vi.mocked(getInsightDigest);
const listWatchRulesMock = vi.mocked(listWatchRules);
const createWatchRuleMock = vi.mocked(createWatchRule);
const updateWatchRuleMock = vi.mocked(updateWatchRule);
const deleteWatchRuleMock = vi.mocked(deleteWatchRule);
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
    await expectStatus(getTodayInsights(request()), 403);
    await expectStatus(getMovementInsights(request()), 403);
    await expectStatus(getTrendInsights(request()), 403);
    await expectStatus(getDigestInsights(request()), 403);
    await expectStatus(getWatchRules(request()), 403);
    await expectStatus(postWatchRules(jsonRequest({ type: "artist", pattern: "Lara Voss" })), 403);
    await expectStatus(patchWatchRules(jsonRequest({ id: "rule-1", enabled: false })), 403);
    await expectStatus(deleteWatchRules(jsonRequest({ id: "rule-1" })), 403);

    expect(getGmailIngestStateMock).not.toHaveBeenCalled();
    expect(getTodaySignalsMock).not.toHaveBeenCalled();
    expect(getMovementSignalsMock).not.toHaveBeenCalled();
    expect(getCatalogTrendsMock).not.toHaveBeenCalled();
    expect(getInsightDigestMock).not.toHaveBeenCalled();
    expect(listWatchRulesMock).not.toHaveBeenCalled();
    expect(createWatchRuleMock).not.toHaveBeenCalled();
    expect(updateWatchRuleMock).not.toHaveBeenCalled();
    expect(deleteWatchRuleMock).not.toHaveBeenCalled();
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

  it("returns today signals through the admin route with conservative limit parsing", async () => {
    await expect(expectJson(getTodayInsights(request()))).resolves.toEqual({
      status: 503,
      body: { error: "DATABASE_URL is not configured" },
    });

    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/app");
    getTodaySignalsMock.mockResolvedValue([{ signalId: "signal-1" }] as never);

    await expect(expectJson(getTodayInsights(new Request("http://app.test/api/insights/today?limit=25")))).resolves.toEqual({
      status: 200,
      body: { signals: [{ signalId: "signal-1" }] },
    });
    expect(getTodaySignalsMock).toHaveBeenLastCalledWith("postgres://user:pass@localhost:5432/app", 25);

    await expect(expectJson(getTodayInsights(new Request("http://app.test/api/insights/today?limit=-1")))).resolves.toEqual({
      status: 200,
      body: { signals: [{ signalId: "signal-1" }] },
    });
    expect(getTodaySignalsMock).toHaveBeenLastCalledWith("postgres://user:pass@localhost:5432/app", 100);

    await expect(expectJson(getTodayInsights(new Request("http://app.test/api/insights/today")))).resolves.toEqual({
      status: 200,
      body: { signals: [{ signalId: "signal-1" }] },
    });
    expect(getTodaySignalsMock).toHaveBeenLastCalledWith("postgres://user:pass@localhost:5432/app", 100);
  });

  it("returns movement, trend, and digest insights through admin routes", async () => {
    await expect(expectJson(getMovementInsights(request()))).resolves.toEqual({
      status: 503,
      body: { error: "DATABASE_URL is not configured" },
    });
    await expect(expectJson(getTrendInsights(request()))).resolves.toEqual({
      status: 503,
      body: { error: "DATABASE_URL is not configured" },
    });
    await expect(expectJson(getDigestInsights(request()))).resolves.toEqual({
      status: 503,
      body: { error: "DATABASE_URL is not configured" },
    });

    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/app");
    getMovementSignalsMock.mockResolvedValue([{ signalId: "movement-1" }] as never);
    getCatalogTrendsMock.mockResolvedValue({ genres: [], labels: [], watchOverlap: [] } as never);
    getInsightDigestMock.mockResolvedValue({ generatedAt: "2026-06-17T00:00:00.000Z" } as never);

    await expect(expectJson(getMovementInsights(new Request("http://app.test/api/insights/movement?limit=25")))).resolves.toEqual({
      status: 200,
      body: { signals: [{ signalId: "movement-1" }] },
    });
    expect(getMovementSignalsMock).toHaveBeenLastCalledWith("postgres://user:pass@localhost:5432/app", 25);

    await expect(expectJson(getMovementInsights(new Request("http://app.test/api/insights/movement?limit=-1")))).resolves.toEqual({
      status: 200,
      body: { signals: [{ signalId: "movement-1" }] },
    });
    expect(getMovementSignalsMock).toHaveBeenLastCalledWith("postgres://user:pass@localhost:5432/app", 100);
    await expect(expectJson(getMovementInsights(new Request("http://app.test/api/insights/movement")))).resolves.toEqual({
      status: 200,
      body: { signals: [{ signalId: "movement-1" }] },
    });
    expect(getMovementSignalsMock).toHaveBeenLastCalledWith("postgres://user:pass@localhost:5432/app", 100);

    await expect(
      expectJson(
        getTrendInsights(
          new Request("http://app.test/api/insights/trends?windowDays=14&previousWindowDays=21&limit=10"),
        ),
      ),
    ).resolves.toEqual({
      status: 200,
      body: { trends: { genres: [], labels: [], watchOverlap: [] } },
    });
    expect(getCatalogTrendsMock).toHaveBeenLastCalledWith({
      databaseUrl: "postgres://user:pass@localhost:5432/app",
      windowDays: 14,
      previousWindowDays: 21,
      limit: 10,
    });

    await expect(
      expectJson(getTrendInsights(new Request("http://app.test/api/insights/trends?windowDays=0&previousWindowDays=91&limit=0"))),
    ).resolves.toEqual({
      status: 200,
      body: { trends: { genres: [], labels: [], watchOverlap: [] } },
    });
    expect(getCatalogTrendsMock).toHaveBeenLastCalledWith({
      databaseUrl: "postgres://user:pass@localhost:5432/app",
      windowDays: 7,
      previousWindowDays: 7,
      limit: 20,
    });
    await expect(expectJson(getTrendInsights(new Request("http://app.test/api/insights/trends")))).resolves.toEqual({
      status: 200,
      body: { trends: { genres: [], labels: [], watchOverlap: [] } },
    });
    expect(getCatalogTrendsMock).toHaveBeenLastCalledWith({
      databaseUrl: "postgres://user:pass@localhost:5432/app",
      windowDays: 7,
      previousWindowDays: 7,
      limit: 20,
    });

    await expect(expectJson(getDigestInsights(request()))).resolves.toEqual({
      status: 200,
      body: { digest: { generatedAt: "2026-06-17T00:00:00.000Z" } },
    });
    expect(getInsightDigestMock).toHaveBeenCalledWith("postgres://user:pass@localhost:5432/app");
  });

  it("guards watch rule CRUD and translates validation outcomes", async () => {
    await expect(expectJson(getWatchRules(request()))).resolves.toEqual({
      status: 503,
      body: { error: "DATABASE_URL is not configured" },
    });
    await expect(expectJson(postWatchRules(jsonRequest({ type: "artist", pattern: "Lara Voss" })))).resolves.toEqual({
      status: 503,
      body: { error: "DATABASE_URL is not configured" },
    });
    await expect(expectJson(patchWatchRules(jsonRequest({ id: "rule-1", enabled: false })))).resolves.toEqual({
      status: 503,
      body: { error: "DATABASE_URL is not configured" },
    });
    await expect(expectJson(deleteWatchRules(jsonRequest({ id: "rule-1" })))).resolves.toEqual({
      status: 503,
      body: { error: "DATABASE_URL is not configured" },
    });

    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/app");
    listWatchRulesMock.mockResolvedValue([{ id: "rule-1", pattern: "Lara Voss" }] as never);
    createWatchRuleMock.mockResolvedValue({ id: "rule-2", pattern: "Blue Note" } as never);
    updateWatchRuleMock.mockResolvedValueOnce({ id: "rule-2", enabled: false } as never).mockResolvedValueOnce(null);
    deleteWatchRuleMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(expectJson(getWatchRules(request()))).resolves.toEqual({
      status: 200,
      body: { rules: [{ id: "rule-1", pattern: "Lara Voss" }] },
    });
    await expect(expectJson(postWatchRules(jsonRequest({ type: "label", pattern: "Blue Note" })))).resolves.toEqual({
      status: 201,
      body: { rule: { id: "rule-2", pattern: "Blue Note" } },
    });
    await expect(expectJson(patchWatchRules(jsonRequest({ id: "rule-2", enabled: false })))).resolves.toEqual({
      status: 200,
      body: { rule: { id: "rule-2", enabled: false } },
    });
    await expect(expectJson(patchWatchRules(jsonRequest({ id: "missing", enabled: true })))).resolves.toEqual({
      status: 404,
      body: { error: "watch_rule_not_found" },
    });
    await expect(expectJson(patchWatchRules(invalidJsonRequest()))).resolves.toEqual({
      status: 400,
      body: { error: "Request body must be valid JSON" },
    });
    await expect(expectJson(deleteWatchRules(jsonRequest({ id: "rule-2" })))).resolves.toEqual({
      status: 200,
      body: { deleted: true },
    });
    await expect(expectJson(deleteWatchRules(jsonRequest({ id: "missing" })))).resolves.toEqual({
      status: 404,
      body: { error: "watch_rule_not_found" },
    });

    await expect(expectJson(postWatchRules(invalidJsonRequest()))).resolves.toEqual({
      status: 400,
      body: { error: "Request body must be valid JSON" },
    });
    createWatchRuleMock.mockRejectedValueOnce("bad rule");
    await expect(expectJson(postWatchRules(jsonRequest({ type: "artist", pattern: "Artist" })))).resolves.toEqual({
      status: 400,
      body: { error: "Invalid watch rule request" },
    });
    await expect(expectJson(deleteWatchRules(jsonRequest({ id: "" })))).resolves.toEqual({
      status: 400,
      body: { error: "Watch rule id is required" },
    });
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

function invalidJsonRequest(): Request {
  return new Request("http://app.test/api/protected", {
    method: "POST",
    body: "{",
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
