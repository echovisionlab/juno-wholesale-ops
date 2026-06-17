import { describe, expect, it } from "vitest";
import { InMemoryLogSink, createAppLogger } from "@/lib/logging/logger";
import {
  ensureJunoSession,
  processLiveLookupJob,
  type BrowserLookupResult,
  type JunoLiveBrowser,
  type JunoSessionState,
  type LiveLookupObservationInput,
  type LiveLookupRepository,
} from "./lookup-runner";

const job = {
  id: "job-1",
  junoId: "1148569-01",
  catalogItemRawId: "item-1",
  attempts: 1,
  maxAttempts: 2,
};

describe("processLiveLookupJob", () => {
  it("records a completed observation from a product page", async () => {
    const repository = new FakeRepository();
    const logs = new InMemoryLogSink();
    const result = await processLiveLookupJob({
      browser: browserWithLookup({
        status: "ok",
        finalUrl: "https://www.juno.co.uk/products/9ms-lunch-vinyl/1148569-01/",
        html: '<div class="product-actions-eq"><span>£20.63</span><em>2 in stock</em></div>',
      }),
      repository,
      logger: createAppLogger({ component: "test", sinks: [logs] }),
      runId: "run-1",
      job,
      delayMinMs: 0,
      delayMaxMs: 0,
      navTimeoutMs: 100,
      retryDelayMs: 50,
      random: () => 0,
      now: fixedClock([1000, 1250]),
    });

    expect(result.status).toBe("completed");
    expect(repository.completed[0]).toMatchObject({
      runId: "run-1",
      observation: {
        status: "in_stock",
        stockQuantity: 2,
        displayStock: "2 in stock",
        durationMs: 250,
      },
    });
    expect(logs.records.map((record) => record.eventName)).toEqual([
      "lookup.delay",
      "page.goto",
      "parse.result",
      "job.complete",
    ]);
  });

  it("blocks jobs when the browser reports a challenge", async () => {
    const repository = new FakeRepository();
    const result = await processLiveLookupJob({
      browser: browserWithLookup({ status: "blocked", finalUrl: "https://www.juno.co.uk/", error: "challenge" }),
      repository,
      logger: createAppLogger({ component: "test", sinks: [new InMemoryLogSink()] }),
      runId: "run-1",
      job,
      delayMinMs: 0,
      delayMaxMs: 0,
      navTimeoutMs: 100,
      retryDelayMs: 50,
      sleep: async () => undefined,
      now: fixedClock([1000, 1001]),
    });

    expect(result).toEqual({ status: "blocked", error: "challenge" });
    expect(repository.blocked).toEqual([{ jobId: "job-1", status: "blocked", error: "challenge" }]);
  });

  it("records blocked lookups without a final URL as null", async () => {
    const repository = new FakeRepository();
    const logs = new InMemoryLogSink();
    const result = await processLiveLookupJob({
      browser: browserWithLookup({ status: "blocked", error: "challenge" }),
      repository,
      logger: createAppLogger({ component: "test", sinks: [logs] }),
      runId: "run-1",
      job,
      delayMinMs: 0,
      delayMaxMs: 0,
      navTimeoutMs: 100,
      retryDelayMs: 50,
      sleep: async () => undefined,
    });

    expect(result).toEqual({ status: "blocked", error: "challenge" });
    expect(logs.records.at(-1)).toMatchObject({
      eventName: "job.complete/block",
      context: { finalUrl: null },
    });
  });

  it("blocks jobs when an ok response contains a challenge page", async () => {
    const repository = new FakeRepository();
    const result = await processLiveLookupJob({
      browser: browserWithLookup({ status: "ok", finalUrl: "https://www.juno.co.uk/", html: "Just a moment Cloudflare" }),
      repository,
      logger: createAppLogger({ component: "test", sinks: [new InMemoryLogSink()] }),
      runId: "run-1",
      job,
      delayMinMs: 0,
      delayMaxMs: 0,
      navTimeoutMs: 100,
      retryDelayMs: 50,
      sleep: async () => undefined,
      now: fixedClock([1000, 1001]),
    });

    expect(result).toEqual({ status: "blocked", error: "challenge_or_captcha" });
    expect(repository.blocked).toEqual([
      { jobId: "job-1", status: "blocked", error: "challenge_or_captcha" },
    ]);
  });

  it("retries failed lookups before max attempts", async () => {
    const repository = new FakeRepository();
    const result = await processLiveLookupJob({
      browser: browserWithLookup({ status: "failed", error: "timeout" }),
      repository,
      logger: createAppLogger({ component: "test", sinks: [new InMemoryLogSink()] }),
      runId: "run-1",
      job,
      delayMinMs: 0,
      delayMaxMs: 0,
      navTimeoutMs: 100,
      retryDelayMs: 50,
      sleep: async () => undefined,
      now: fixedClock([1000, 1001]),
    });

    expect(result).toEqual({ status: "retry", error: "timeout" });
    expect(repository.retries).toEqual([{ jobId: "job-1", error: "timeout", delayMs: 50 }]);
  });

  it("fails jobs that have exhausted attempts", async () => {
    const repository = new FakeRepository();
    const result = await processLiveLookupJob({
      browser: browserWithLookup({ status: "failed", error: "timeout" }),
      repository,
      logger: createAppLogger({ component: "test", sinks: [new InMemoryLogSink()] }),
      runId: "run-1",
      job: { ...job, attempts: 2 },
      delayMinMs: 0,
      delayMaxMs: 0,
      navTimeoutMs: 100,
      retryDelayMs: 50,
      sleep: async () => undefined,
      now: fixedClock([1000, 1001]),
    });

    expect(result).toEqual({ status: "failed", error: "timeout" });
    expect(repository.failures).toEqual([{ jobId: "job-1", error: "timeout" }]);
  });
});

describe("ensureJunoSession", () => {
  it("accepts existing sessions and successful login-required paths", async () => {
    const logger = createAppLogger({ component: "test", sinks: [new InMemoryLogSink()] });

    await expect(ensureJunoSession(browserWithSession({ status: "authenticated" }), logger)).resolves.toEqual({
      status: "authenticated",
    });
    await expect(ensureJunoSession(browserWithSession({ status: "login_required" }), logger)).resolves.toEqual({
      status: "authenticated",
    });
  });

  it("returns blocked and failed session states", async () => {
    const logger = createAppLogger({ component: "test", sinks: [new InMemoryLogSink()] });

    await expect(ensureJunoSession(browserWithSession({ status: "blocked", error: "challenge" }), logger)).resolves.toEqual({
      status: "blocked",
      error: "challenge",
    });
    await expect(ensureJunoSession(browserWithSession({ status: "failed", error: "missing" }), logger)).resolves.toEqual({
      status: "failed",
      error: "missing",
    });
  });
});

class FakeRepository implements LiveLookupRepository {
  completed: Array<{ runId: string; observation: LiveLookupObservationInput }> = [];
  retries: Array<{ jobId: string; error: string; delayMs: number }> = [];
  failures: Array<{ jobId: string; error: string }> = [];
  blocked: Array<{ jobId: string; status: "blocked" | "manual_required"; error: string }> = [];

  async recordObservationAndComplete(runId: string, observation: LiveLookupObservationInput): Promise<void> {
    this.completed.push({ runId, observation });
  }

  async markJobForRetry(jobId: string, error: string, delayMs: number): Promise<void> {
    this.retries.push({ jobId, error, delayMs });
  }

  async markJobFailed(jobId: string, error: string): Promise<void> {
    this.failures.push({ jobId, error });
  }

  async markJobBlocked(jobId: string, status: "blocked" | "manual_required", error: string): Promise<void> {
    this.blocked.push({ jobId, status, error });
  }
}

function browserWithLookup(result: BrowserLookupResult): JunoLiveBrowser {
  return {
    ensureLoggedIn: async () => ({ status: "authenticated" }),
    getProductPage: async () => result,
    close: async () => undefined,
  };
}

function browserWithSession(state: JunoSessionState): JunoLiveBrowser {
  return {
    ensureLoggedIn: async () => state,
    getProductPage: async () => ({ status: "failed", error: "unused" }),
    close: async () => undefined,
  };
}

function fixedClock(values: number[]): () => number {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}
