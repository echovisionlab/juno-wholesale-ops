import type { MailAuthType, MailCredentialType, MailProvider } from "./mail-source";

export const GMAIL_WORKSPACE_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export type MailProviderDescriptor = {
  provider: MailProvider;
  label: string;
  implemented: boolean;
  authType: MailAuthType;
  credentialType: MailCredentialType;
  fixedScopes: string | null;
};

export const mailProviderRegistry: MailProviderDescriptor[] = [
  {
    provider: "gmail",
    label: "Gmail Workspace",
    implemented: true,
    authType: "google_workspace_delegation",
    credentialType: "google_service_account_json",
    fixedScopes: GMAIL_WORKSPACE_READONLY_SCOPE,
  },
  {
    provider: "imap",
    label: "IMAP",
    implemented: false,
    authType: "basic",
    credentialType: "password",
    fixedScopes: null,
  },
  {
    provider: "microsoft_graph",
    label: "Microsoft Graph",
    implemented: false,
    authType: "oauth2",
    credentialType: "oauth_client_secret",
    fixedScopes: null,
  },
  {
    provider: "generic",
    label: "Generic mailbox",
    implemented: false,
    authType: "api_token",
    credentialType: "api_token",
    fixedScopes: null,
  },
];

export function getMailProviderDescriptor(provider: MailProvider): MailProviderDescriptor {
  return mailProviderRegistry.find((entry) => entry.provider === provider) as MailProviderDescriptor;
}

export function getMailProviderLabel(provider: MailProvider): string {
  return getMailProviderDescriptor(provider).label;
}

export function isMailProviderImplemented(provider: MailProvider): boolean {
  return getMailProviderDescriptor(provider).implemented;
}

export function assertMailProviderImplemented(provider: MailProvider): void {
  const descriptor = getMailProviderDescriptor(provider);
  if (!descriptor.implemented) {
    throw new Error(`${descriptor.label} mail source adapter is not implemented`);
  }
}
