import type { RuntimeEnv } from "@/lib/env";
import { isSupportedLoginLogoUrl, LOGIN_LOGO_URL_REQUIREMENT } from "@/lib/auth/login-logo";
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
  currentRequestOrigin?: string | null;
}): SettingsWarning[] {
  const warnings: SettingsWarning[] = [];
  const authBaseUrl = options.row?.auth_base_url ?? options.env.AUTH_BASE_URL;
  const emailPasswordEnabled =
    options.row?.auth_email_password_enabled ?? options.env.AUTH_EMAIL_PASSWORD_ENABLED;
  const externalProviderEnabled =
    options.row?.auth_external_provider_enabled ?? options.env.AUTH_EXTERNAL_PROVIDER_ENABLED;
  const trustedOrigins = splitOriginList(options.row?.auth_trusted_origins ?? options.env.AUTH_TRUSTED_ORIGINS);

  if (!hasSettingValue(authBaseUrl)) {
    warnings.push({
      id: "auth_base_url_missing",
      severity: "critical",
      message: "Site address is required before browser auth flows can be tested.",
    });
  }

  if (authBaseUrl && options.currentRequestOrigin && normalizeOrigin(authBaseUrl) !== normalizeOrigin(options.currentRequestOrigin)) {
    warnings.push({
      id: "auth_base_url_origin_mismatch",
      severity: "warning",
      message: `Configured Site address (${authBaseUrl}) does not match the current origin (${options.currentRequestOrigin}). Auth callbacks use the configured Site address.`,
    });
  }

  if (options.currentRequestOrigin && trustedOrigins.length > 0 && !trustedOrigins.includes(normalizeOrigin(options.currentRequestOrigin))) {
    warnings.push({
      id: "auth_trusted_origin_missing_current",
      severity: "warning",
      message: `Trusted origins do not include the current origin (${options.currentRequestOrigin}). Add it before testing browser auth flows.`,
    });
  }

  if (!emailPasswordEnabled && !externalProviderEnabled) {
    warnings.push({
      id: "auth_no_sign_in_method",
      severity: "critical",
      message: "At least one admin sign-in method must be enabled.",
    });
  }

  if (externalProviderEnabled && !hasSettingValue(options.row?.auth_external_client_secret ?? options.env.AUTH_EXTERNAL_CLIENT_SECRET)) {
    warnings.push({
      id: "auth_external_provider_client_secret_missing",
      severity: "critical",
      message: "External provider is enabled, but the client secret is not configured.",
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
  return key === "auth" || key === "mail" || key === "juno" || key === "notifications" || key === "advanced";
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
    return { kind: "invalid", issue: "cannot be empty; use null to clear the saved setting" };
  }
  if (definition.type === "email" && text.length > 0 && !isEmail(text)) {
    return { kind: "invalid", issue: "must be a valid email address" };
  }
  if (definition.type === "url" && text.length > 0 && !isUrl(text)) {
    return { kind: "invalid", issue: "must be a valid URL" };
  }
  if (definition.key === "auth_login_logo_url" && text.length > 0 && !isSupportedLoginLogoUrl(text)) {
    return { kind: "invalid", issue: LOGIN_LOGO_URL_REQUIREMENT };
  }
  if (definition.key === "data_mode" && text !== "demo" && text !== "real_mailbox") {
    return { kind: "invalid", issue: "must be demo or real_mailbox" };
  }
  return { kind: "value", value: text };
}

function splitOriginList(value: string | undefined | null): string[] {
  return (
    value
      ?.split(/[,\n]+/)
      .map((item) => normalizeOrigin(item.trim()))
      .filter(Boolean) ?? []
  );
}

function normalizeOrigin(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return value.replace(/\/+$/, "");
  }
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
  const emailPasswordEnabled = effectiveBoolean("auth_email_password_enabled", merged, options.env);
  const externalProviderEnabled = effectiveBoolean("auth_external_provider_enabled", merged, options.env);

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
  if (emailPasswordEnabled === false && externalProviderEnabled !== true) {
    issues.push("auth_email_password_enabled can be disabled only when auth_external_provider_enabled is true");
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

function effectiveBoolean(column: ServiceSettingColumn, row: ServiceSettingsRow, env: RuntimeEnv): boolean | null {
  const definition = definitionsByKey.get(column);
  const value = row[column] ?? (definition ? getRuntimeValue(definition, env) : undefined) ?? null;
  return typeof value === "boolean" ? value : null;
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
