import type { RuntimeEnv } from "@/lib/env";
import type {
  ServiceSettingsRow,
  SettingDefinition,
  SettingDescriptor,
  SettingSource,
} from "./descriptors";

export type RawRuntimeEnv = Record<string, string | undefined>;
export type SettingResolutionContext = {
  externalProviderEnabled: boolean;
  junoLookupEnabled: boolean;
};

export function resolveSettingDescriptor(options: {
  definition: SettingDefinition;
  row: ServiceSettingsRow | null;
  env: RuntimeEnv;
  rawEnv: RawRuntimeEnv;
  context: SettingResolutionContext;
}): SettingDescriptor {
  const rowValue = options.definition.rowColumn ? options.row?.[options.definition.rowColumn] : undefined;
  const source = resolveSettingSource({
    definition: options.definition,
    rowValue,
  });
  const value = resolveEffectiveValue({
    definition: options.definition,
    rowValue,
    source,
  });
  const configured = hasSettingValue(value);
  const required = isDefinitionRequired(options.definition, options.context);

  return {
    key: options.definition.key,
    label: options.definition.label,
    value: options.definition.secret ? null : normalizeDescriptorValue(value),
    displayValue: displaySettingValue(options.definition, value),
    source,
    state: configured ? "configured" : required ? "missing" : "disabled",
    secret: options.definition.secret,
    editable: options.definition.editable,
    clearable: options.definition.editable && hasSettingValue(rowValue),
    required,
    requiredWhen: options.definition.requiredWhen,
    runtimeOnly: options.definition.runtimeOnly ?? false,
    advanced: options.definition.advanced ?? false,
    unit: options.definition.unit,
    help: options.definition.help,
    type: options.definition.type,
    options: options.definition.options,
  };
}

export function hasSettingValue(value: unknown): boolean {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  return value !== null && value !== undefined;
}

function maskSecret(value: unknown): string {
  if (!hasSettingValue(value)) {
    return "Not saved";
  }
  return "Saved";
}

function resolveSettingSource(options: {
  definition: SettingDefinition;
  rowValue: unknown;
}): SettingSource {
  if (hasSettingValue(options.rowValue)) {
    return "database";
  }
  if (options.definition.defaultValue !== undefined) {
    return "default";
  }
  return "unset";
}

function resolveEffectiveValue(options: {
  definition: SettingDefinition;
  rowValue: unknown;
  source: SettingSource;
}): string | number | boolean | null | undefined {
  if (options.source === "database") {
    return options.rowValue as string | number | boolean | null | undefined;
  }
  if (options.source === "default") {
    return options.definition.defaultValue;
  }
  return null;
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
): string {
  if (definition.secret) {
    return maskSecret(value);
  }
  if (!hasSettingValue(value)) {
    return definition.required ? "Not configured" : "Not set";
  }
  if (typeof value === "boolean") {
    return value ? "On" : "Off";
  }
  return String(value);
}

function isDefinitionRequired(
  definition: SettingDefinition,
  context: SettingResolutionContext,
): boolean {
  if (definition.requiredWhen === "always") {
    return true;
  }
  if (definition.requiredWhen === "juno_lookup_enabled") {
    return context.junoLookupEnabled;
  }
  return definition.required;
}
