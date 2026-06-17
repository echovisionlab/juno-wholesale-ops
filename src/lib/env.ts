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
  DATABASE_URL: z.string().url().optional(),
  AUTH_ENABLED: stringBoolean.default(false),
  AUTH_SECRET: z.string().min(32).optional(),
  AUTH_BASE_URL: z.string().url().optional(),
  AUTH_TRUSTED_ORIGINS: z.string().optional(),
  AUTH_EMAIL_PASSWORD_ENABLED: stringBoolean.default(true),
  AUTH_EXTERNAL_PROVIDER_ENABLED: stringBoolean.default(false),
  AUTH_EXTERNAL_PROVIDER_ID: z.string().min(1).optional(),
  AUTH_EXTERNAL_PROVIDER_NAME: z.string().min(1).optional(),
  AUTH_EXTERNAL_DISCOVERY_URL: z.string().url().optional(),
  AUTH_EXTERNAL_CLIENT_ID: z.string().min(1).optional(),
  AUTH_EXTERNAL_CLIENT_SECRET: z.string().min(1).optional(),
  AUTH_INITIAL_ADMIN_EMAIL: z.string().email().optional(),
  AUTH_INITIAL_ADMIN_PASSWORD: z.string().min(8).optional(),
  AUTH_INITIAL_ADMIN_NAME: z.string().min(1).default("Initial Admin"),
  GOOGLE_WORKSPACE_DELEGATED_USER: z.string().email().optional(),
  GOOGLE_SERVICE_ACCOUNT_KEY_JSON: z.string().min(1).optional(),
  GOOGLE_GMAIL_SCOPES: z
    .string()
    .default(GOOGLE_GMAIL_READONLY_SCOPE),
  GMAIL_INGEST_QUERY: z
    .string()
    .default("has:attachment filename:xlsx newer_than:30d"),
  GMAIL_MAX_RESULTS: z.coerce.number().int().positive().max(500).default(25),
  GMAIL_INGEST_LOOKBACK_MS: z.coerce.number().int().positive().default(604800000),
  GMAIL_PROCESSED_LABEL: z.string().min(1).default("Wholesale Processed"),
  GMAIL_STORAGE_DIR: z.string().min(1).default(".data/mail-attachments"),
  CATALOG_ATTACHMENT_PATTERN: z.string().min(1).default("New Preorders|New Releases In Stock"),
  SUPPLIER_CODE: z.string().min(1).default("juno"),
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
