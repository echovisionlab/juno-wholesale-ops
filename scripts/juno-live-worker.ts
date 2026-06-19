import crypto from "node:crypto";
import { Pool } from "pg";
import { loadRuntimeEnv } from "@/lib/env";
import { processMovementSignalsForRecentObservations } from "@/lib/insights/movement-repository";
import { PlaywrightJunoBrowser } from "@/lib/juno-live/playwright-browser";
import { enqueueLiveLookupJobs, JunoLiveRepository } from "@/lib/juno-live/repository";
import { ensureJunoSession, processLiveLookupJob, type LiveLookupRunnerResult } from "@/lib/juno-live/lookup-runner";
import {
  resolveJunoLiveSettings,
  shouldAutoEnqueueLiveLookups,
  shouldContinueAutomaticLookup,
} from "@/lib/juno-live/settings";
import {
  ConsoleJsonLogSink,
  createAppLogger,
  PostgresLogSink,
  type AppLogger,
} from "@/lib/logging/logger";

async function main() {
  const env = loadRuntimeEnv();

  const loopMode = process.argv.includes("--loop");
  const workerId = `${crypto.randomUUID()}`;
  const pool = new Pool({ connectionString: env.DATABASE_URL, max: 8 });
  const logger = createAppLogger({
    component: "juno-live-worker",
    correlationId: workerId,
    sinks: [new ConsoleJsonLogSink(), new PostgresLogSink(pool)],
  });
  const repository = new JunoLiveRepository(pool);
  const settings = resolveJunoLiveSettings(await repository.getServiceSettingsRow());
  const browser = new PlaywrightJunoBrowser({
    profileDir: settings.browserProfileDir,
    headless: settings.browserHeadless,
    loginEmail: settings.loginEmail,
    loginPassword: settings.loginPassword,
    logger,
  });

  try {
    let nextAutoEnqueueAt = 0;
    do {
      if (loopMode && shouldAutoEnqueueLiveLookups(settings) && Date.now() >= nextAutoEnqueueAt) {
        const enqueueResult = await enqueueLiveLookupJobs({
          databaseUrl: env.DATABASE_URL,
          limit: settings.autoEnqueueLimit,
          maxAttempts: settings.maxAttempts,
        });
        nextAutoEnqueueAt = Date.now() + settings.pollIntervalMs;
        await logger.info("live.enqueue/interval", {
          enqueued: enqueueResult.enqueued,
          limit: settings.autoEnqueueLimit,
          pollIntervalMs: settings.pollIntervalMs,
          nextAutoEnqueueAt: new Date(nextAutoEnqueueAt).toISOString(),
        });
      }

      const processed = await runWorkerIteration({
        repository,
        browser,
        logger,
        databaseUrl: env.DATABASE_URL,
        workerId,
        triggerSource: loopMode ? "loop" : "manual",
        concurrency: settings.concurrency,
        delayMinMs: settings.delayMinMs,
        delayMaxMs: settings.delayMaxMs,
        navTimeoutMs: settings.navTimeoutMs,
        retryDelayMs: settings.retryDelayMs,
      });
      if (!loopMode) {
        break;
      }
      if (processed === 0) {
        if (!shouldContinueAutomaticLookup(settings)) {
          await logger.info("worker.idle/no_schedule", { pollIntervalMs: null });
          break;
        }
        const sleepMs = getIdleSleepMs(settings.pollIntervalMs, nextAutoEnqueueAt);
        await logger.info("worker.idle/sleep", {
          sleepMs,
          pollIntervalMs: settings.pollIntervalMs,
          nextAutoEnqueueAt: nextAutoEnqueueAt > 0 ? new Date(nextAutoEnqueueAt).toISOString() : null,
        });
        await sleep(sleepMs);
      }
    } while (loopMode);
  } finally {
    await browser.close();
    await pool.end();
  }
}

async function runWorkerIteration(options: {
  repository: JunoLiveRepository;
  browser: PlaywrightJunoBrowser;
  logger: AppLogger;
  databaseUrl: string;
  workerId: string;
  triggerSource: string;
  concurrency: number;
  delayMinMs: number;
  delayMaxMs: number;
  navTimeoutMs: number;
  retryDelayMs: number;
}): Promise<number> {
  const jobs = await options.repository.claimJobs(options.concurrency, options.workerId);
  await options.logger.info("job.claim", { claimed: jobs.length, concurrency: options.concurrency });
  if (jobs.length === 0) {
    return 0;
  }

  const runId = await options.repository.createRun(options.triggerSource, options.workerId);
  const runLogger = options.logger.child({ runId });
  const session = await ensureJunoSession(options.browser, runLogger);
  if (session.status !== "authenticated") {
    const blockedStatus = session.status === "blocked" ? "blocked" : "manual_required";
    await Promise.all(
      jobs.map((job) =>
        options.repository.markJobBlocked(job.id, blockedStatus, session.status === "login_required" ? "login_required" : session.error),
      ),
    );
    await options.repository.finishRun(runId, "failed", { claimed: jobs.length, blockedStatus }, session.status);
    return jobs.length;
  }

  const results = await Promise.all(
    jobs.map((job) =>
      processLiveLookupJob({
        browser: options.browser,
        repository: options.repository,
        logger: runLogger,
        runId,
        job,
        delayMinMs: options.delayMinMs,
        delayMaxMs: options.delayMaxMs,
        navTimeoutMs: options.navTimeoutMs,
        retryDelayMs: options.retryDelayMs,
      }),
    ),
  );
  const summary = summarizeResults(results);
  if ((summary.succeeded ?? 0) > 0) {
    try {
      const movementResult = await processMovementSignalsForRecentObservations({
        databaseUrl: options.databaseUrl,
      });
      summary.movement = movementResult;
      await runLogger.info("insights.movement/succeeded", movementResult);
    } catch (error) {
      summary.movementError = error instanceof Error ? error.message : "movement processing failed";
      await runLogger.error("insights.movement/failed", { error: summary.movementError });
    }
  }
  await options.repository.finishRun(runId, "succeeded", summary, null);
  return jobs.length;
}

type RunSummary = Record<string, unknown> & {
  succeeded?: number;
  movement?: unknown;
  movementError?: string;
};

function summarizeResults(results: LiveLookupRunnerResult[]): RunSummary {
  return results.reduce<RunSummary>((summary, result) => {
    const currentCount = typeof summary[result.status] === "number" ? (summary[result.status] as number) : 0;
    summary[result.status] = currentCount + 1;
    return summary;
  }, {});
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function getIdleSleepMs(pollIntervalMs: number, nextAutoEnqueueAt: number): number {
  if (nextAutoEnqueueAt <= 0) {
    return pollIntervalMs;
  }
  return Math.max(1000, Math.min(pollIntervalMs, nextAutoEnqueueAt - Date.now()));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
