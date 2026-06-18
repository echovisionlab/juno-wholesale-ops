import type { RuntimeEnv } from "@/lib/env";
import { settingDefinitions, type SettingsGroup, type SettingsResponse } from "./descriptors";
import { resolveSettingDescriptor, type RawRuntimeEnv } from "./masking";
import { collectSettingsWarnings } from "./validation";
import type { ServiceSettingsRow, SettingsGroupId, NextAction } from "./descriptors";

const groupOrder: SettingsGroupId[] = ["system", "auth", "gmail", "juno", "notifications", "advanced"];

export function buildSettingsResponse(options: {
  env: RuntimeEnv;
  rawEnv: RawRuntimeEnv;
  settingsRow: ServiceSettingsRow | null;
  nodeEnv: string;
}): SettingsResponse {
  const descriptors = settingDefinitions.map((definition) =>
    resolveSettingDescriptor({
      definition,
      row: options.settingsRow,
      env: options.env,
      rawEnv: options.rawEnv,
    }),
  );
  const warnings = collectSettingsWarnings({
    row: options.settingsRow,
    env: options.env,
    nodeEnv: options.nodeEnv,
  });
  const groups: SettingsGroup[] = groupOrder.map((groupId) => {
    const settings =
      groupId === "advanced"
        ? descriptors
        : descriptors.filter((descriptor) => descriptorGroup(descriptor.key) === groupId);
    const warningForGroup = warnings.some((warning) => warning.id.startsWith(groupId));
    return {
      id: groupId,
      label: groupLabel(groupId),
      state: groupState(settings, warningForGroup),
      settings,
    };
  });

  return {
    environment: {
      nodeEnv: options.nodeEnv,
      appBaseUrl: resolveAppBaseUrl(options.settingsRow, options.env),
      deploymentMode: resolveDeploymentMode(options.nodeEnv),
      lastUpdatedAt: options.settingsRow?.updated_at ? new Date(options.settingsRow.updated_at).toISOString() : null,
      readOnlyBoundary: {
        noCart: true,
        noOrdering: true,
        noCheckout: true,
      },
    },
    groups,
    nextActions: buildNextActions(groups, warnings),
    warnings,
  };
}

function descriptorGroup(key: string): SettingsGroupId {
  const definition = settingDefinitions.find((entry) => entry.key === key);
  return definition?.group ?? "advanced";
}

function groupLabel(id: SettingsGroupId): string {
  if (id === "gmail") {
    return "Gmail Ingest";
  }
  if (id === "juno") {
    return "Juno Live";
  }
  if (id === "auth") {
    return "Auth";
  }
  if (id === "notifications") {
    return "Notifications";
  }
  if (id === "advanced") {
    return "Advanced";
  }
  return "System";
}

function groupState(settings: SettingsGroup["settings"], warning: boolean): SettingsGroup["state"] {
  if (settings.some((setting) => setting.state === "missing")) {
    return "missing";
  }
  if (warning) {
    return "warning";
  }
  if (settings.every((setting) => setting.state === "disabled")) {
    return "disabled";
  }
  return "complete";
}

function buildNextActions(groups: SettingsGroup[], warnings: SettingsResponse["warnings"]): NextAction[] {
  const actions: NextAction[] = [];
  const missingGroups = groups.filter((group) => group.state === "missing");

  if (missingGroups.length > 0) {
    actions.push({
      id: "open-settings-center",
      label: "Open Settings Center",
      detail: `Complete ${missingGroups.map((group) => group.label).join(", ")} before enabling ingest or live lookup actions.`,
      href: "/settings",
      severity: "critical",
    });
  }

  if (settingsInGroup(groups, "gmail").some((setting) => setting.state === "missing")) {
    actions.push({
      id: "configure-gmail",
      label: "Configure Gmail ingest",
      detail: "Set the delegated mailbox and service account key reference, then run the Gmail smoke test.",
      href: "/settings",
      action: "test-gmail",
      severity: "warning",
    });
  }

  if (settingsInGroup(groups, "juno").some((setting) => setting.state === "missing")) {
    actions.push({
      id: "configure-juno",
      label: "Configure read-only Juno live lookup",
      detail: "Set login credentials and safe delay bounds before starting the browser worker.",
      href: "/settings",
      action: "test-juno-session",
      severity: "warning",
    });
  }

  for (const warning of warnings.filter((entry) => entry.severity === "critical")) {
    actions.push({
      id: `warning-${warning.id}`,
      label: "Resolve critical setting warning",
      detail: warning.message,
      href: "/settings",
      severity: "critical",
    });
  }

  if (actions.length === 0) {
    actions.push({
      id: "review-read-only-boundary",
      label: "Review read-only operating boundary",
      detail: "Settings are usable. Keep live lookup and notification delivery observation-only.",
      href: "/settings",
      severity: "info",
    });
  }

  return actions;
}

function settingsInGroup(groups: SettingsGroup[], id: SettingsGroupId): SettingsGroup["settings"] {
  return groups.find((group) => group.id === id)?.settings ?? [];
}

function resolveAppBaseUrl(row: ServiceSettingsRow | null, env: RuntimeEnv): string | null {
  return row?.auth_base_url ?? env.AUTH_BASE_URL ?? null;
}

function resolveDeploymentMode(nodeEnv: string): SettingsResponse["environment"]["deploymentMode"] {
  if (nodeEnv === "production") {
    return "production";
  }
  if (nodeEnv === "development" || nodeEnv === "test") {
    return "development";
  }
  return "unknown";
}
