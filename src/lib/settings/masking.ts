import type { RuntimeEnv } from "@/lib/env";
import type {
  ServiceSettingsRow,
  SettingDefinition,
  SettingDescriptor,
  SettingSource,
} from "./descriptors";

export type RawRuntimeEnv = Record<string, string | undefined>;

export function resolveSettingDescriptor(options: {
  definition: SettingDefinition;
  row: ServiceSettingsRow | null;
  env: RuntimeEnv;
  rawEnv: RawRuntimeEnv;
}): SettingDescriptor {
  const rowValue = options.definition.rowColumn ? options.row?.[options.definition.rowColumn] : undefined;
  const runtimeValue = getRuntimeValue(options.definition, options.env);
  const rawRuntimeValue = getRawRuntimeValue(options.definition, options.rawEnv);
  const source = resolveSettingSource({
    definition: options.definition,
    rowValue,
    runtimeValue,
    rawRuntimeValue,
  });
  const value = resolveEffectiveValue({
    definition: options.definition,
    rowValue,
    runtimeValue,
    source,
  });
  const configured = hasSettingValue(value);

  return {
    key: options.definition.key,
    label: options.definition.label,
    value: options.definition.secret ? null : normalizeDescriptorValue(value),
    displayValue: displaySettingValue(options.definition, value, source),
    source,
    state: configured ? "configured" : options.definition.required ? "missing" : "disabled",
    secret: options.definition.secret,
    editable: options.definition.editable,
    clearable: options.definition.editable && hasSettingValue(rowValue),
    required: options.definition.required,
    help: options.definition.help,
    type: options.definition.type,
  };
}

export function getRuntimeValue(definition: SettingDefinition, env: RuntimeEnv): string | number | boolean | undefined {
  return definition.envKey ? env[definition.envKey] : undefined;
}

function getRawRuntimeValue(definition: SettingDefinition, rawEnv: RawRuntimeEnv): string | undefined {
  const key = definition.runtimeEnvKey ?? definition.envKey;
  return key ? rawEnv[key] : undefined;
}

export function hasSettingValue(value: unknown): boolean {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  return value !== null && value !== undefined;
}

function maskSecret(value: unknown, source: SettingSource): string {
  if (!hasSettingValue(value)) {
    return "Not configured";
  }
  if (source === "database") {
    return "Database override configured";
  }
  if (source === "runtime") {
    return "Runtime fallback configured";
  }
  return "Configured";
}

function resolveSettingSource(options: {
  definition: SettingDefinition;
  rowValue: unknown;
  runtimeValue: unknown;
  rawRuntimeValue: string | undefined;
}): SettingSource {
  if (hasSettingValue(options.rowValue)) {
    return "database";
  }
  if (hasSettingValue(options.rawRuntimeValue)) {
    return "runtime";
  }
  if (options.definition.defaultValue !== undefined || hasSettingValue(options.runtimeValue)) {
    return "default";
  }
  return "unset";
}

function resolveEffectiveValue(options: {
  definition: SettingDefinition;
  rowValue: unknown;
  runtimeValue: unknown;
  source: SettingSource;
}): string | number | boolean | null | undefined {
  if (options.source === "database") {
    return options.rowValue as string | number | boolean | null | undefined;
  }
  if (options.source === "runtime" || options.source === "default") {
    return normalizeEffectiveValue(options.runtimeValue) ?? options.definition.defaultValue;
  }
  return null;
}

function normalizeEffectiveValue(value: unknown): string | number | boolean | null | undefined {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null || value === undefined) {
    return value;
  }
  return undefined;
}

function normalizeDescriptorValue(value: unknown): string | number | boolean | null {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return null;
}

function displaySettingValue(
  definition: SettingDefinition,
  value: string | number | boolean | null | undefined,
  source: SettingSource,
): string {
  if (definition.secret) {
    return maskSecret(value, source);
  }
  if (!hasSettingValue(value)) {
    return definition.required ? "Not configured" : "Not set";
  }
  if (typeof value === "boolean") {
    return value ? "Enabled" : "Disabled";
  }
  return String(value);
}
