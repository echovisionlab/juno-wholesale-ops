import type { MailAuthType, MailCredentialType, MailProvider } from "@/lib/ingest/mail-source";
import { mailProviderRegistry } from "@/lib/ingest/mail-provider-registry";
import type { AttachmentStorageBackend } from "@/lib/storage/attachment-storage";
import type { SignalEventType, SignalSeverity } from "@/lib/insights/repository";
import type { NotificationProviderKey } from "@/lib/notifications/types";
import type { NotificationWebhookFormat } from "@/lib/notifications/provider-formatters";
import type {
  MailSourceDraft,
  NotificationChannelDraft,
  NotificationRuleDraft,
  SsoProviderDraft,
  SsoProviderPreset,
  SsoProviderProtocol,
} from "./settings-types";

export const gmailReadonlyScope = "https://www.googleapis.com/auth/gmail.readonly";

export const emptyMailSourceDraft: MailSourceDraft = {
  name: "",
  provider: "gmail",
  authType: "google_workspace_delegation",
  credentialType: "google_service_account_json",
  credentialSecret: "",
  scopes: gmailReadonlyScope,
  mailboxAddress: "",
  displayName: "",
  providerMailboxId: "",
  query: "filename:xlsx",
  maxResults: 25,
  lookbackMs: 604800000,
  processedLabel: "Wholesale Processed",
  storageBackend: "local_drive",
  storageDir: ".data/mail",
  storageEndpoint: "http://localhost:29100",
  storageBucket: "juno-wholesale-ops",
  storagePrefix: "mail-attachments",
  storageRegion: "us-east-1",
  storageAccessKeyId: "",
  storageSecret: "",
  storageForcePathStyle: true,
  attachmentPattern: "xlsx",
  supplierCode: "juno",
  isActive: true,
};

export const mailProviderOptions: Array<{ value: MailProvider; label: string; disabled?: boolean }> = mailProviderRegistry.map((provider) => ({
  value: provider.provider,
  label: provider.label,
  disabled: !provider.implemented,
})).filter((provider) => !provider.disabled);

export const plannedMailProviderOptions = mailProviderRegistry
  .filter((provider) => !provider.implemented)
  .map((provider) => `${provider.label} (planned)`);

export const mailAuthTypeOptions: Array<{ value: MailAuthType; label: string }> = [
  { value: "google_workspace_delegation", label: "Google Workspace delegation" },
  { value: "basic", label: "Basic" },
  { value: "oauth2", label: "OAuth 2.0" },
  { value: "api_token", label: "API token" },
  { value: "none", label: "None" },
];

export const mailCredentialTypeOptions: Array<{ value: MailCredentialType; label: string }> = [
  { value: "google_service_account_json", label: "Google service account JSON" },
  { value: "password", label: "Password" },
  { value: "oauth_client_secret", label: "OAuth client secret" },
  { value: "api_token", label: "API token" },
  { value: "none", label: "None" },
];

export const attachmentStorageBackendOptions: Array<{ value: AttachmentStorageBackend; label: string }> = [
  { value: "local_drive", label: "Local drive" },
  { value: "s3_compatible", label: "S3 compatible / MinIO" },
];

export const notificationProviderOptions: Array<{ value: NotificationProviderKey; label: string }> = [
  { value: "in_app", label: "In-app" },
  { value: "logging", label: "Logging" },
  { value: "webhook_generic", label: "Generic webhook" },
  { value: "webhook_slack", label: "Slack-style webhook" },
  { value: "webhook_discord", label: "Discord-style webhook" },
  { value: "webhook_telegram", label: "Telegram-style webhook" },
];

export const notificationSignalTypeOptions: Array<{ value: SignalEventType; label: string }> = [
  { value: "new_arrival", label: "New arrival" },
  { value: "watch_hit", label: "Watch hit" },
  { value: "low_catalog_stock", label: "Low catalog stock" },
  { value: "exclude_match", label: "Exclude match" },
  { value: "observed_restock", label: "Observed restock" },
  { value: "observed_stock_drop", label: "Observed stock drop" },
  { value: "observed_live_low_stock", label: "Observed live low stock" },
  { value: "observed_status_change", label: "Observed status change" },
  { value: "observed_price_change", label: "Observed price change" },
  { value: "fast_mover_candidate", label: "Fast mover candidate" },
  { value: "trend_spike", label: "Trend spike" },
];

export const notificationSeverityOptions: Array<{ value: SignalSeverity; label: string }> = [
  { value: "info", label: "Info" },
  { value: "watch", label: "Watch" },
  { value: "warning", label: "Warning" },
  { value: "critical", label: "Critical" },
];

export const emptyNotificationChannelDraft: NotificationChannelDraft = {
  name: "",
  type: "in_app",
  provider: "in_app",
  enabled: true,
  webhookFormat: "generic" satisfies NotificationWebhookFormat,
  webhookUrl: "",
  telegramChatId: "",
  secretRef: "",
};

export const emptyNotificationRuleDraft: NotificationRuleDraft = {
  name: "",
  channelId: "",
  enabled: true,
  signalTypes: [],
  severities: [],
  minScore: 0,
  includeWatchHits: true,
  includeDigest: false,
  cooldownMinutes: 60,
};

export const emptySsoProviderDraft: SsoProviderDraft = {
  providerId: "",
  displayName: "",
  protocol: "oidc",
  preset: "custom_oidc",
  buttonLabel: "",
  logoUrl: "",
  discoveryUrl: "",
  authorizationUrl: "",
  tokenUrl: "",
  userInfoUrl: "",
  clientId: "",
  clientSecret: "",
  scopes: "openid email profile",
  enabled: false,
  sortOrder: 0,
  adminEmailAllowlist: "",
  adminClaim: "",
  adminClaimValue: "",
};

export const ssoProviderPresetOptions: Array<{
  value: SsoProviderPreset;
  label: string;
  protocol: SsoProviderProtocol;
  discoveryUrl?: string;
  scopes: string;
}> = [
  { value: "custom_oidc", label: "OpenID Connect", protocol: "oidc", scopes: "openid email profile" },
  { value: "custom_oauth2", label: "OAuth 2.0", protocol: "oauth2", scopes: "openid email profile" },
  { value: "google_oidc", label: "Google Workspace", protocol: "oidc", discoveryUrl: "https://accounts.google.com/.well-known/openid-configuration", scopes: "openid email profile" },
  { value: "microsoft_entra_oidc", label: "Microsoft Entra ID", protocol: "oidc", scopes: "openid email profile" },
  { value: "auth0_oidc", label: "Auth0", protocol: "oidc", scopes: "openid email profile" },
  { value: "okta_oidc", label: "Okta", protocol: "oidc", scopes: "openid email profile" },
];
