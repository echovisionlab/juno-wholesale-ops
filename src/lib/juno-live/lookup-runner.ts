import type { AppLogger } from "@/lib/logging/logger";
import { getJitterDelayMs, type RandomSource } from "./delay";
import { parseJunoProductHtml, type JunoLiveStatus } from "./parser";
import { buildJunoProductUrl } from "./url";

export type JunoSessionState =
  | { status: "authenticated" }
  | { status: "login_required" }
  | { status: "blocked"; error: string }
  | { status: "failed"; error: string };

export type BrowserLookupResult =
  | { status: "ok"; html: string; finalUrl: string }
  | { status: "blocked"; finalUrl?: string; error: string }
  | { status: "failed"; finalUrl?: string; error: string };

export interface JunoLiveBrowser {
  ensureLoggedIn(): Promise<JunoSessionState>;
  getProductPage(productUrl: string, timeoutMs: number): Promise<BrowserLookupResult>;
  close(): Promise<void>;
}

export type LiveLookupJob = {
  id: string;
  junoId: string;
  catalogItemRawId: string | null;
  attempts: number;
  maxAttempts: number;
};

export type LiveLookupObservationInput = {
  jobId: string;
  junoId: string;
  catalogItemRawId: string | null;
  status: JunoLiveStatus;
  stockQuantity: number | null;
  stockText: string | null;
  displayStock: string;
  wholesalePriceGbp: number | null;
  productUrl: string;
  finalUrl: string | null;
  parserVersion: string;
  durationMs: number;
  error: string | null;
  metadata: Record<string, unknown>;
};

export type LiveLookupRepository = {
  recordObservationAndComplete(runId: string, observation: LiveLookupObservationInput): Promise<void>;
  markJobForRetry(jobId: string, error: string, delayMs: number): Promise<void>;
  markJobFailed(jobId: string, error: string): Promise<void>;
  markJobBlocked(jobId: string, status: "blocked" | "manual_required", error: string): Promise<void>;
};

export type LiveLookupRunnerOptions = {
  browser: JunoLiveBrowser;
  repository: LiveLookupRepository;
  logger: AppLogger;
  runId: string;
  job: LiveLookupJob;
  delayMinMs: number;
  delayMaxMs: number;
  navTimeoutMs: number;
  retryDelayMs: number;
  random?: RandomSource;
  sleep?: (delayMs: number) => Promise<void>;
  now?: () => number;
};

export type LiveLookupRunnerResult =
  | { status: "completed"; observation: LiveLookupObservationInput }
  | { status: "retry"; error: string }
  | { status: "failed"; error: string }
  | { status: "blocked"; error: string };

export async function processLiveLookupJob(options: LiveLookupRunnerOptions): Promise<LiveLookupRunnerResult> {
  const jobLogger = options.logger.child({ jobId: options.job.id });
  const delayMs = getJitterDelayMs({
    minMs: options.delayMinMs,
    maxMs: options.delayMaxMs,
    random: options.random,
  });
  await jobLogger.info("lookup.delay", { delayMs, junoId: options.job.junoId });
  await (options.sleep ?? defaultSleep)(delayMs);

  const productUrl = buildJunoProductUrl(options.job.junoId);
  const startedAt = (options.now ?? Date.now)();
  await jobLogger.info("page.goto", { productUrl, timeoutMs: options.navTimeoutMs });

  const lookup = await options.browser.getProductPage(productUrl, options.navTimeoutMs);
  const durationMs = Math.max(0, (options.now ?? Date.now)() - startedAt);

  if (lookup.status === "blocked") {
    await options.repository.markJobBlocked(options.job.id, "blocked", lookup.error);
    await jobLogger.warn("job.complete/block", { productUrl, finalUrl: lookup.finalUrl ?? null, durationMs }, lookup.error);
    return { status: "blocked", error: lookup.error };
  }

  if (lookup.status === "failed") {
    return await handleLookupFailure(options, jobLogger, lookup.error);
  }

  const parsed = parseJunoProductHtml(lookup.html, lookup.finalUrl);
  const observation: LiveLookupObservationInput = {
    jobId: options.job.id,
    junoId: options.job.junoId,
    catalogItemRawId: options.job.catalogItemRawId,
    status: parsed.status,
    stockQuantity: parsed.stockQuantity,
    stockText: parsed.stockText,
    displayStock: parsed.displayStock,
    wholesalePriceGbp: parsed.wholesalePriceGbp,
    productUrl,
    finalUrl: parsed.finalUrl,
    parserVersion: parsed.parserVersion,
    durationMs,
    error: parsed.status === "blocked" ? "challenge_or_captcha" : null,
    metadata: parsed.metadata,
  };

  await jobLogger.info("parse.result", {
    status: observation.status,
    stockQuantity: observation.stockQuantity,
    displayStock: observation.displayStock,
    wholesalePriceGbp: observation.wholesalePriceGbp,
    finalUrl: observation.finalUrl,
  });

  if (parsed.status === "blocked") {
    await options.repository.markJobBlocked(options.job.id, "blocked", "challenge_or_captcha");
    await jobLogger.warn("job.complete/block", { durationMs, finalUrl: observation.finalUrl }, "challenge_or_captcha");
    return { status: "blocked", error: "challenge_or_captcha" };
  }

  await options.repository.recordObservationAndComplete(options.runId, observation);
  await jobLogger.info("job.complete", { durationMs, status: observation.status });
  return { status: "completed", observation };
}

export async function ensureJunoSession(browser: JunoLiveBrowser, logger: AppLogger): Promise<JunoSessionState> {
  await logger.info("session.check");
  const state = await browser.ensureLoggedIn();
  if (state.status === "authenticated") {
    await logger.info("login.success", { reusedSession: true });
    return state;
  }
  if (state.status === "login_required") {
    await logger.info("login.success", { reusedSession: false });
    return { status: "authenticated" };
  }
  const eventName = state.status === "blocked" ? "login.failure" : "session.failure";
  await logger.error(eventName, { status: state.status }, state.error);
  return state;
}

async function handleLookupFailure(
  options: LiveLookupRunnerOptions,
  logger: AppLogger,
  error: string,
): Promise<LiveLookupRunnerResult> {
  if (options.job.attempts >= options.job.maxAttempts) {
    await options.repository.markJobFailed(options.job.id, error);
    await logger.error("job.complete/failure", { attempts: options.job.attempts }, error);
    return { status: "failed", error };
  }
  await options.repository.markJobForRetry(options.job.id, error, options.retryDelayMs);
  await logger.warn("job.retry", { attempts: options.job.attempts, retryDelayMs: options.retryDelayMs }, error);
  return { status: "retry", error };
}

function defaultSleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
