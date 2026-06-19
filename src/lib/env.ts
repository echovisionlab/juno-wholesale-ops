import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const GOOGLE_GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const GOOGLE_GMAIL_MODIFY_SCOPE = "https://www.googleapis.com/auth/gmail.modify";

const serverEnvSchema = {
  DATABASE_URL: z.string().url(),
  AUTH_INITIAL_ADMIN_EMAIL: z.string().email().optional(),
  AUTH_INITIAL_ADMIN_PASSWORD: z.string().min(8).optional(),
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
