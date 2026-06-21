import type { SettingsGroup, SettingsResponse, SettingDescriptor, SettingsWarning } from "@/lib/settings/descriptors";
import type { SsoProviderInput, SsoProviderPatch } from "@/lib/auth/sso-provider-repository";
import type { MailAuthType, MailCredentialType, MailProvider, MailboxSourceInput, MailboxSourcePatch, PublicMailboxSource } from "@/lib/ingest/mail-source";
import { getMailProviderDescriptor } from "@/lib/ingest/mail-provider-registry";
import type { MailSourceConnectionTestResult } from "@/lib/ingest/mail-source-test";
import type { AttachmentStorageBackend } from "@/lib/storage/attachment-storage";
import type { SignalEventType } from "@/lib/insights/repository";
import type {
  NotificationChannel,
  NotificationChannelInput,
  NotificationChannelType,
  NotificationProviderKey,
  NotificationRule,
  NotificationRuleInput,
} from "@/lib/notifications/types";
import {
  normalizeNotificationWebhookFormat,
  notificationWebhookFormatLabel,
  type NotificationWebhookFormat,
} from "@/lib/notifications/provider-formatters";
import type { MailSourceDraft, NotificationChannelDraft, NotificationRuleDraft, SsoProviderDraft, SsoProviderPreset } from "./settings-types";
import {
  attachmentStorageBackendOptions,
  mailAuthTypeOptions,
  mailCredentialTypeOptions,
  notificationSignalTypeOptions,
  ssoProviderPresetOptions,
} from "./settings-options";

export function providerToDraft(provider: SettingsResponse["units"]["authProvider"]["providers"][number]): SsoProviderDraft {
  return {
    id: provider.id,
    providerId: provider.providerId,
    displayName: provider.displayName,
    protocol: provider.protocol,
    preset: provider.preset as SsoProviderPreset,
    buttonLabel: provider.buttonLabel,
    logoUrl: provider.logoUrl ?? "",
    discoveryUrl: provider.discoveryUrl ?? "",
    authorizationUrl: provider.authorizationUrl ?? "",
    tokenUrl: provider.tokenUrl ?? "",
    userInfoUrl: provider.userInfoUrl ?? "",
    clientId: provider.clientId ?? "",
    clientSecretRef: provider.clientSecretRef ?? "",
    scopes: provider.scopes.join(" "),
    enabled: provider.enabled,
    sortOrder: provider.sortOrder,
    adminEmailAllowlist: provider.adminEmailAllowlist.join("\n"),
    adminClaim: provider.adminClaim ?? "",
    adminClaimValue: provider.adminClaimValue ?? "",
  };
}

export function applyProviderPreset(draft: SsoProviderDraft, presetValue: SsoProviderPreset): SsoProviderDraft {
  const preset = ssoProviderPresetOptions.find((entry) => entry.value === presetValue);
  if (!preset) {
    return draft;
  }
  return {
    ...draft,
    preset: preset.value,
    protocol: preset.protocol,
    scopes: draft.scopes || preset.scopes,
    discoveryUrl: preset.discoveryUrl ?? draft.discoveryUrl,
  };
}

export function ssoProviderPayload(draft: SsoProviderDraft, editingId: string | null): SsoProviderInput | SsoProviderPatch {
  const editing = Boolean(editingId);
  const payload: SsoProviderInput | SsoProviderPatch = {
    ...(editing && editingId ? { id: editingId } : {}),
    providerId: draft.providerId,
    displayName: draft.displayName,
    protocol: draft.protocol,
    preset: draft.preset,
    buttonLabel: draft.buttonLabel,
    logoUrl: draft.logoUrl,
    discoveryUrl: draft.discoveryUrl,
    authorizationUrl: draft.authorizationUrl,
    tokenUrl: draft.tokenUrl,
    userInfoUrl: draft.userInfoUrl,
    clientId: draft.clientId,
    clientSecretRef: draft.clientSecretRef,
    scopes: draft.scopes,
    enabled: draft.enabled,
    sortOrder: draft.sortOrder,
    adminEmailAllowlist: draft.adminEmailAllowlist,
    adminClaim: draft.adminClaim,
    adminClaimValue: draft.adminClaimValue,
  };
  if (editing && "clientSecretRef" in payload && !draft.clientSecretRef.trim()) {
    delete payload.clientSecretRef;
  }
  return payload;
}

export function presetLabel(value: string): string {
  return ssoProviderPresetOptions.find((preset) => preset.value === value)?.label ?? value;
}

export function formatMailProvider(provider: MailProvider): string {
  return getMailProviderDescriptor(provider).label;
}

export function formatMailAuthType(authType: MailAuthType): string {
  return mailAuthTypeOptions.find((option) => option.value === authType)?.label ?? authType;
}

export function formatMailCredentialType(credentialType: MailCredentialType): string {
  return mailCredentialTypeOptions.find((option) => option.value === credentialType)?.label ?? credentialType;
}

export function formatStorageBackend(backend: AttachmentStorageBackend): string {
  return attachmentStorageBackendOptions.find((option) => option.value === backend)?.label ?? backend;
}

export function formatMailSourceStorageTarget(source: PublicMailboxSource): string {
  if (source.storageBackend === "local_drive") {
    return source.storageDir;
  }
  const prefix = source.storagePrefix.replace(/^\/+|\/+$/g, "");
  return `s3://${source.storageBucket}${prefix ? `/${prefix}` : ""}`;
}

export function mailSourceToDraft(source: PublicMailboxSource): MailSourceDraft {
  return {
    id: source.id,
    name: source.name,
    provider: source.provider,
    authType: source.authType,
    credentialType: source.credentialType,
    credentialSecret: "",
    scopes: source.scopes,
    mailboxAddress: source.mailboxAddress,
    displayName: source.displayName ?? "",
    providerMailboxId: "",
    query: source.query,
    maxResults: source.maxResults,
    lookbackMs: source.lookbackMs,
    processedLabel: source.processedLabel,
    storageBackend: source.storageBackend,
    storageDir: source.storageDir,
    storageEndpoint: source.storageEndpoint,
    storageBucket: source.storageBucket,
    storagePrefix: source.storagePrefix,
    storageRegion: source.storageRegion,
    storageAccessKeyId: source.storageAccessKeyId,
    storageSecret: "",
    storageForcePathStyle: source.storageForcePathStyle,
    attachmentPattern: source.attachmentPattern,
    supplierCode: source.supplierCode,
    isActive: source.isActive,
  };
}

export function applyMailProviderPreset(draft: MailSourceDraft, provider: MailProvider): MailSourceDraft {
  const descriptor = getMailProviderDescriptor(provider);
  return {
    ...draft,
    provider,
    authType: descriptor.authType,
    credentialType: descriptor.credentialType,
    scopes: descriptor.fixedScopes ?? draft.scopes,
  };
}

export function mailSourcePayload(draft: MailSourceDraft, editing: boolean): MailboxSourceInput | MailboxSourcePatch {
  const provider = getMailProviderDescriptor(draft.provider);
  const payload: MailboxSourceInput | MailboxSourcePatch = {
    ...(editing && draft.id ? { id: draft.id } : {}),
    name: draft.name,
    provider: draft.provider,
    authType: provider.authType,
    credentialType: provider.credentialType,
    credentialSecret: draft.credentialSecret,
    scopes: provider.fixedScopes ?? draft.scopes,
    mailboxAddress: draft.mailboxAddress,
    displayName: draft.displayName,
    providerMailboxId: draft.providerMailboxId,
    query: draft.query,
    maxResults: draft.maxResults,
    lookbackMs: draft.lookbackMs,
    processedLabel: draft.processedLabel,
    storageBackend: draft.storageBackend,
    storageDir: draft.storageDir,
    storageEndpoint: draft.storageEndpoint,
    storageBucket: draft.storageBucket,
    storagePrefix: draft.storagePrefix,
    storageRegion: draft.storageRegion,
    storageAccessKeyId: draft.storageAccessKeyId,
    storageSecret: draft.storageSecret,
    storageForcePathStyle: draft.storageForcePathStyle,
    attachmentPattern: draft.attachmentPattern,
    supplierCode: draft.supplierCode,
    isActive: draft.isActive,
  };
  if (editing && "credentialSecret" in payload && !draft.credentialSecret.trim()) {
    delete payload.credentialSecret;
  }
  if (editing && "storageSecret" in payload && !draft.storageSecret.trim()) {
    delete payload.storageSecret;
  }
  return payload;
}

export function formatNotificationChannelType(type: NotificationChannelType): string {
  if (type === "in_app") {
    return "In-app";
  }
  if (type === "webhook") {
    return "Webhook";
  }
  return "Logging";
}

export function formatNotificationChannelProvider(channel: NotificationChannel): string {
  if (channel.type !== "webhook") {
    return formatNotificationChannelType(channel.type);
  }
  return notificationWebhookFormatLabel(normalizeNotificationWebhookFormat(channel.config.format));
}

export function formatSignalType(type: SignalEventType): string {
  return notificationSignalTypeOptions.find((option) => option.value === type)?.label ?? type;
}

const junoSessionStatusMessages: Record<string, string> = {
  missing_credentials: "Login credentials are missing.",
  read_only_preflight_passed: "Session settings are ready.",
};

export function formatJunoSessionCheckStatus(status: unknown): string | undefined {
  if (typeof status !== "string" || !status.trim()) {
    return undefined;
  }
  return junoSessionStatusMessages[status] ?? "Session settings need attention.";
}

const mailSourceTestStatusMessages: Partial<Record<MailSourceConnectionTestResult["status"], string>> = {
  credential_missing: "Credential JSON is required.",
  invalid_configuration: "Complete the required connection fields.",
  provider_not_implemented: "This adapter cannot be tested yet.",
  storage_failed: "Attachment storage check failed.",
};

export function formatMailSourceTestStatus(result: MailSourceConnectionTestResult): string {
  if (result.ok) {
    const count = result.messageCount ?? 0;
    return `${count} message${count === 1 ? "" : "s"} matched; storage checked.`;
  }
  if (result.error) {
    return result.error;
  }
  return mailSourceTestStatusMessages[result.status] ?? "Connection failed.";
}

const settingsActionErrorMessages: Record<string, string> = {
  invalid_settings: "Review the highlighted settings.",
  mail_source_connection_test_required: "Run a successful connection test before saving.",
  mail_source_connection_test_failed: "Connection test failed. Check the source settings.",
  mail_source_not_found: "Mail source was not found.",
  notification_channel_not_found: "Notification channel was not found.",
  notification_rule_not_found: "Notification rule was not found.",
  provider_not_found: "Provider was not found.",
  sso_provider_not_found: "Provider was not found.",
};

const settingsActionErrorIssueMessages: Array<[RegExp, string]> = [
  [/clientSecretRef is required/i, "Add a client secret reference before creating the provider."],
  [/clientSecretRef must use/i, "Use env:NAME or file:/absolute/path for the client secret reference."],
  [/clientSecret is not accepted/i, "Use a client secret reference instead of a raw client secret."],
];

export function formatSettingsActionError(error: unknown, fallback: string): string {
  if (typeof error !== "string" || !error.trim()) {
    return fallback;
  }
  const trimmed = error.trim();
  if (settingsActionErrorMessages[trimmed]) {
    return settingsActionErrorMessages[trimmed];
  }
  const issueMessage = settingsActionErrorIssueMessages.find(([pattern]) => pattern.test(trimmed))?.[1];
  if (issueMessage) {
    return issueMessage;
  }
  return /^[a-z]+(?:_[a-z0-9]+)+$/.test(trimmed) ? fallback : trimmed;
}

export function notificationChannelToDraft(channel: NotificationChannel): NotificationChannelDraft {
  const webhookFormat = channel.type === "webhook"
    ? normalizeNotificationWebhookFormat(channel.config.format)
    : "generic";
  return {
    id: channel.id,
    name: channel.name,
    type: channel.type,
    provider: notificationProviderKey(channel.type, webhookFormat),
    enabled: channel.enabled,
    webhookFormat,
    webhookUrl: "",
    telegramChatId: typeof channel.config.chatId === "string" && !channel.config.chatId.includes("[")
      ? channel.config.chatId
      : "",
    secretRef: channel.secretRef ?? "",
  };
}

export function notificationChannelPayload(
  draft: NotificationChannelDraft,
  editing: boolean,
): NotificationChannelInput | (Partial<NotificationChannelInput> & { id: string }) {
  const provider = notificationProviderFromKey(draft.provider);
  const payload: NotificationChannelInput | (Partial<NotificationChannelInput> & { id: string }) = {
    ...(editing && draft.id ? { id: draft.id } : {}),
    name: draft.name,
    type: provider.type,
    enabled: draft.enabled,
    secretRef: draft.secretRef,
  };
  if (provider.type === "webhook") {
    const config: Record<string, unknown> = {
      format: provider.format,
      ...(provider.format === "telegram" && draft.telegramChatId.trim() ? { chatId: draft.telegramChatId.trim() } : {}),
    };
    if (draft.webhookUrl.trim()) {
      config.url = draft.webhookUrl.trim();
    }
    payload.config = config;
  } else {
    payload.config = {};
  }
  return payload;
}

export function notificationProviderFromKey(provider: NotificationProviderKey): {
  type: NotificationChannelType;
  format: NotificationWebhookFormat;
} {
  if (provider === "logging") {
    return { type: "logging", format: "generic" };
  }
  if (provider === "in_app") {
    return { type: "in_app", format: "generic" };
  }
  return {
    type: "webhook",
    format: provider.replace(/^webhook_/, "") as NotificationWebhookFormat,
  };
}

function notificationProviderKey(
  type: NotificationChannelType,
  format: NotificationWebhookFormat,
): NotificationProviderKey {
  if (type === "logging" || type === "in_app") {
    return type;
  }
  return `webhook_${format}`;
}

export function notificationRuleToDraft(rule: NotificationRule): NotificationRuleDraft {
  return {
    id: rule.id,
    name: rule.name,
    channelId: rule.channelId,
    enabled: rule.enabled,
    signalTypes: rule.signalTypes,
    severities: rule.severities,
    minScore: rule.minScore,
    includeWatchHits: rule.includeWatchHits,
    includeDigest: rule.includeDigest,
    cooldownMinutes: rule.cooldownMinutes,
  };
}

export function notificationRulePayload(draft: NotificationRuleDraft): NotificationRuleInput | (Partial<NotificationRuleInput> & { id: string }) {
  return {
    ...(draft.id ? { id: draft.id } : {}),
    name: draft.name,
    channelId: draft.channelId,
    enabled: draft.enabled,
    signalTypes: draft.signalTypes,
    severities: draft.severities,
    minScore: draft.minScore,
    includeWatchHits: draft.includeWatchHits,
    includeDigest: draft.includeDigest,
    cooldownMinutes: draft.cooldownMinutes,
  };
}

export function severityColor(severity: SettingsWarning["severity"]): string {
  if (severity === "critical") {
    return "red";
  }
  if (severity === "warning") {
    return "yellow";
  }
  return "blue";
}

export function buildOverviewUnits(settings: SettingsResponse): Array<{
  label: string;
  status: "Ready" | "Needs attention" | "Not enabled";
  detail: string;
}> {
  const authGroup = settings.groups.find((group) => group.id === "auth");
  const authNeedsAttention = settings.security.authBootstrap.status !== "ready" || authGroup?.state === "missing" || authGroup?.state === "warning";
  return [
    {
      label: "Auth & Admin Access",
      status: authNeedsAttention ? "Needs attention" : "Ready",
      detail: authNeedsAttention ? "Review Auth tab." : "Ready.",
    },
    {
      label: "Mail Ingest",
      status: unitOverviewStatus(settings.units.mail.status),
      detail: settings.units.mail.status === "ready" ? "Ready." : "Add a mail source.",
    },
    {
      label: "Juno Live",
      status: unitOverviewStatus(settings.units.junoLive.status),
      detail: settings.units.junoLive.status === "disabled" ? "Not enabled." : settings.units.junoLive.status === "ready" ? "Ready." : "Review Juno Live tab.",
    },
    {
      label: "Notifications",
      status: unitOverviewStatus(settings.units.notifications.status),
      detail: settings.units.notifications.status === "ready" ? "Ready." : "Review Notifications tab.",
    },
  ];
}

function unitOverviewStatus(status: SettingsResponse["units"]["mail"]["status"]): "Ready" | "Needs attention" | "Not enabled" {
  if (status === "ready") {
    return "Ready";
  }
  if (status === "disabled") {
    return "Not enabled";
  }
  return "Needs attention";
}

export function findSetting(settings: SettingsResponse, key: string): SettingDescriptor | undefined {
  return settings.groups.flatMap((group) => group.settings).find((setting) => setting.key === key);
}

export function findGroupSetting(group: SettingsGroup, key: string): SettingDescriptor | undefined {
  return group.settings.find((setting) => setting.key === key);
}

export function formatAdminCount(count: number | null): string {
  if (count === null) {
    return "count unavailable";
  }
  return `${count} existing admin${count === 1 ? "" : "s"}`;
}

export function normalizeOrigin(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return value.replace(/\/+$/, "");
  }
}
