import type { RuntimeEnv } from "@/lib/env";
import { GOOGLE_GMAIL_MODIFY_SCOPE, GOOGLE_GMAIL_READONLY_SCOPE, hasGmailModifyScope } from "@/lib/env";
import {
  definitionsByKey,
  type ServiceSettingsPatch,
  type ServiceSettingsRow,
  type ServiceSettingColumn,
  type SettingDefinition,
  type SettingsWarning,
} from "./descriptors";
import { getRuntimeValue, hasSettingValue, type RawRuntimeEnv } from "./masking";

export type SettingsValidationResult =
  | {
      ok: true;
      patch: ServiceSettingsPatch;
      changed: ServiceSettingColumn[];
      warnings: SettingsWarning[];
    }
  | {
      ok: false;
      issues: string[];
      warnings: SettingsWarning[];
    };

export function validateSettingsPatch(options: {
  input: unknown;
  currentRow: ServiceSettingsRow | null;
  env: RuntimeEnv;
  rawEnv: RawRuntimeEnv;
  nodeEnv: string;
}): SettingsValidationResult {
  const flattened = flattenSettingsPatch(options.input);
  const patch: ServiceSettingsPatch = {};
  const changed: ServiceSettingColumn[] = [];
  const issues: string[] = [];

  for (const [key, value] of Object.entries(flattened)) {
    const definition = definitionsByKey.get(key);
    if (!definition?.editable || !definition.rowColumn) {
      issues.push(`${key} is not an editable setting`);
      continue;
    }

    const normalized = normalizePatchValue(definition, value);
    if (normalized.kind === "noop") {
      continue;
    }
    if (normalized.kind === "invalid") {
      issues.push(`${definition.key}: ${normalized.issue}`);
      continue;
    }

    patch[definition.rowColumn] = normalized.value;
    changed.push(definition.rowColumn);
  }

  issues.push(...validateResolvedPatch({ patch, currentRow: options.currentRow, env: options.env }));
  const warnings = collectSettingsWarnings({
    row: { ...(options.currentRow ?? {}), ...patch } as ServiceSettingsRow,
    env: options.env,
    nodeEnv: options.nodeEnv,
  });

  if (issues.length > 0) {
    return { ok: false, issues, warnings };
  }

  return {
    ok: true,
    patch,
    changed,
    warnings,
  };
}

export function collectSettingsWarnings(options: {
  row: ServiceSettingsRow | null;
  env: RuntimeEnv;
  nodeEnv: string;
}): SettingsWarning[] {
  const warnings: SettingsWarning[] = [];
  const authEnabled = options.row?.auth_enabled ?? options.env.AUTH_ENABLED;
  const authBaseUrl = options.row?.auth_base_url ?? options.env.AUTH_BASE_URL;
  const gmailScopes = options.row?.google_gmail_scopes ?? options.env.GOOGLE_GMAIL_SCOPES;
  const emailPasswordEnabled =
    options.row?.auth_email_password_enabled ?? options.env.AUTH_EMAIL_PASSWORD_ENABLED;
  const externalProviderEnabled =
    options.row?.auth_external_provider_enabled ?? options.env.AUTH_EXTERNAL_PROVIDER_ENABLED;

  if (gmailScopes && hasGmailModifyScope(gmailScopes)) {
    warnings.push({
      id: "gmail_modify_scope",
      severity: "warning",
      message: `${GOOGLE_GMAIL_READONLY_SCOPE} is recommended. ${GOOGLE_GMAIL_MODIFY_SCOPE} should only be used when label mode is intentionally enabled.`,
    });
  }

  if (options.nodeEnv === "production" && !authEnabled) {
    warnings.push({
      id: "production_auth_disabled",
      severity: "critical",
      message: "Production deployments must keep admin auth enabled.",
    });
  }

  if (authEnabled && !hasSettingValue(options.env.AUTH_SECRET)) {
    warnings.push({
      id: "auth_secret_missing",
      severity: "critical",
      message: "AUTH_SECRET is runtime-only and required when admin auth is enabled.",
    });
  }

  if (authEnabled && !hasSettingValue(authBaseUrl)) {
    warnings.push({
      id: "auth_base_url_missing",
      severity: "critical",
      message: "AUTH_BASE_URL or auth_base_url is required when admin auth is enabled.",
    });
  }

  if (authEnabled && !emailPasswordEnabled && !externalProviderEnabled) {
    warnings.push({
      id: "auth_no_sign_in_method",
      severity: "critical",
      message: "At least one admin sign-in method must be enabled.",
    });
  }

  return warnings;
}

function flattenSettingsPatch(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value && typeof value === "object" && !Array.isArray(value) && isKnownGroupKey(key)) {
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        output[nestedKey] = nestedValue;
      }
      continue;
    }
    output[key] = value;
  }
  return output;
}

function isKnownGroupKey(key: string): boolean {
  return key === "auth" || key === "gmail" || key === "juno" || key === "notifications" || key === "advanced";
}

function normalizePatchValue(
  definition: SettingDefinition,
  value: unknown,
):
  | { kind: "noop" }
  | { kind: "invalid"; issue: string }
  | { kind: "value"; value: string | number | boolean | null } {
  if (value === undefined) {
    return { kind: "noop" };
  }
  if (value === null) {
    return { kind: "value", value: null };
  }
  if (definition.secret && typeof value === "string" && value.trim() === "") {
    return { kind: "noop" };
  }

  if (definition.type === "boolean") {
    if (typeof value === "boolean") {
      return { kind: "value", value };
    }
    if (typeof value === "string" && ["true", "false"].includes(value.toLowerCase())) {
      return { kind: "value", value: value.toLowerCase() === "true" };
    }
    return { kind: "invalid", issue: "must be boolean" };
  }

  if (definition.type === "number") {
    const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (!Number.isInteger(numberValue)) {
      return { kind: "invalid", issue: "must be an integer" };
    }
    return { kind: "value", value: numberValue };
  }

  if (typeof value !== "string") {
    return { kind: "invalid", issue: "must be a string" };
  }
  const text = value.trim();
  if (definition.required && text.length === 0) {
    return { kind: "invalid", issue: "cannot be empty; use null to clear the DB override" };
  }
  if (definition.type === "email" && text.length > 0 && !isEmail(text)) {
    return { kind: "invalid", issue: "must be a valid email address" };
  }
  if (definition.type === "url" && text.length > 0 && !isUrl(text)) {
    return { kind: "invalid", issue: "must be a valid URL" };
  }
  if (definition.key === "google_gmail_scopes" && text.length === 0) {
    return { kind: "invalid", issue: "must include at least the Gmail read-only scope" };
  }
  return { kind: "value", value: text };
}

function validateResolvedPatch(options: {
  patch: ServiceSettingsPatch;
  currentRow: ServiceSettingsRow | null;
  env: RuntimeEnv;
}): string[] {
  const merged = { ...(options.currentRow ?? {}), ...options.patch } as ServiceSettingsRow;
  const issues: string[] = [];
  const concurrency = effectiveNumber("juno_live_concurrency", merged, options.env);
  const delayMin = effectiveNumber("juno_live_delay_min_ms", merged, options.env);
  const delayMax = effectiveNumber("juno_live_delay_max_ms", merged, options.env);
  const pollInterval = effectiveNullableNumber("juno_live_poll_interval_ms", merged, options.env);
  const maxResults = effectiveNumber("gmail_max_results", merged, options.env);

  if (concurrency !== null && (concurrency < 1 || concurrency > 10)) {
    issues.push("juno_live_concurrency must be between 1 and 10");
  }
  if (delayMin !== null && delayMin < 0) {
    issues.push("juno_live_delay_min_ms must be zero or greater");
  }
  if (delayMax !== null && delayMax < 0) {
    issues.push("juno_live_delay_max_ms must be zero or greater");
  }
  if (delayMin !== null && delayMax !== null && delayMin > delayMax) {
    issues.push("juno_live_delay_min_ms must be <= juno_live_delay_max_ms");
  }
  if (pollInterval !== null && pollInterval <= 0) {
    issues.push("juno_live_poll_interval_ms must be null or a positive integer");
  }
  if (maxResults !== null && (maxResults < 1 || maxResults > 500)) {
    issues.push("gmail_max_results must be between 1 and 500");
  }

  return issues;
}

function effectiveNumber(column: ServiceSettingColumn, row: ServiceSettingsRow, env: RuntimeEnv): number | null {
  const definition = definitionsByKey.get(column);
  const value = row[column] ?? (definition ? getRuntimeValue(definition, env) : undefined);
  return typeof value === "number" ? value : null;
}

function effectiveNullableNumber(column: ServiceSettingColumn, row: ServiceSettingsRow, env: RuntimeEnv): number | null {
  const definition = definitionsByKey.get(column);
  const value = row[column] ?? (definition ? getRuntimeValue(definition, env) : undefined) ?? null;
  return typeof value === "number" ? value : null;
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
