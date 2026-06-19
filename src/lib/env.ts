import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const GOOGLE_GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const GOOGLE_GMAIL_MODIFY_SCOPE = "https://www.googleapis.com/auth/gmail.modify";

const stringBoolean = z.preprocess((value) => {
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") {
      return true;
    }
    if (value.toLowerCase() === "false") {
      return false;
    }
  }
  return value;
}, z.boolean());

const serverEnvSchema = {
  DATABASE_URL: z.string().url(),
  JUNO_WHOLESALE_OPS_DATA_MODE: z.enum(["demo", "real_mailbox"]).default("demo"),
  AUTH_SECRET: z.string().min(32).optional(),
  AUTH_BASE_URL: z.string().url().optional(),
  AUTH_TRUSTED_ORIGINS: z.string().optional(),
  AUTH_INITIAL_ADMIN_EMAIL: z.string().email().optional(),
  AUTH_INITIAL_ADMIN_PASSWORD: z.string().min(8).optional(),
  AUTH_INITIAL_ADMIN_NAME: z.string().min(1).default("Initial Admin"),
  JUNO_LIVE_ENQUEUE_ON_INGEST: stringBoolean.default(false),
  JUNO_LOGIN_EMAIL: z.string().email().optional(),
  JUNO_LOGIN_PASSWORD: z.string().min(1).optional(),
  JUNO_BROWSER_PROFILE_DIR: z.string().min(1).default(".data/juno-browser-profile"),
  JUNO_BROWSER_HEADLESS: stringBoolean.default(true),
  JUNO_LIVE_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(1),
  JUNO_LIVE_DELAY_MIN_MS: z.coerce.number().int().nonnegative().default(30000),
  JUNO_LIVE_DELAY_MAX_MS: z.coerce.number().int().nonnegative().default(180000),
  JUNO_LIVE_NAV_TIMEOUT_MS: z.coerce.number().int().positive().default(45000),
  JUNO_LIVE_MAX_ATTEMPTS: z.coerce.number().int().positive().default(2),
  JUNO_LIVE_POLL_INTERVAL_MS: z.coerce.number().int().positive().optional(),
  JUNO_LIVE_AUTO_ENQUEUE_ON_INTERVAL: stringBoolean.default(false),
  JUNO_LIVE_AUTO_ENQUEUE_LIMIT: z.coerce.number().int().positive().default(1000),
  JUNO_LIVE_WORKER_COMMAND: z.string().min(1).optional(),
  JUNO_LIVE_WORKER_ARGS: z.string().min(1).optional(),
} as const;

const envKeys = Object.keys(serverEnvSchema) as Array<keyof typeof serverEnvSchema>;
type RuntimeEnvKey = (typeof envKeys)[number];
type RuntimeEnvInput = Record<string, string | boolean | number | undefined>;
type StrictRuntimeEnvInput = Record<RuntimeEnvKey, string | boolean | number | undefined>;

export type RuntimeEnv = ReturnType<typeof loadRuntimeEnv>;

export function loadRuntimeEnv(overrides: RuntimeEnvInput = process.env): ReturnType<typeof createRuntimeEnv> {
  return createRuntimeEnv(buildRuntimeEnv(overrides));
}

export function getDatabaseUrl(overrides: RuntimeEnvInput = process.env): string {
  return loadRuntimeEnv(overrides).DATABASE_URL;
}

export function parseScopes(scopes: string): string[] {
  return scopes
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

export function hasGmailModifyScope(scopes: string): boolean {
  return parseScopes(scopes).includes(GOOGLE_GMAIL_MODIFY_SCOPE);
}

function createRuntimeEnv(runtimeEnv: StrictRuntimeEnvInput) {
  return createEnv({
    server: serverEnvSchema,
    emptyStringAsUndefined: true,
    runtimeEnv,
  });
}

function buildRuntimeEnv(overrides: RuntimeEnvInput): StrictRuntimeEnvInput {
  return Object.fromEntries(envKeys.map((key) => [key, overrides[key]])) as StrictRuntimeEnvInput;
}
