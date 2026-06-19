/* @vitest-environment jsdom */

import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { act } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SettingsResponse } from "@/lib/settings/descriptors";
import { theme } from "@/theme";
import {
  formatJunoSessionCheckStatus,
  formatMailSourceTestStatus,
  formatSettingsActionError,
  SettingsPage,
} from "./SettingsPage";

let root: Root;
let container: HTMLDivElement;

describe("SettingsPage", () => {
  beforeEach(() => {
    setReactActEnvironment();
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("renders concise Settings Center sections without removed diagnostics or demo controls", async () => {
    const writeText = vi.fn().mockResolvedValueOnce(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    await renderSettingsPage(settingsFixture());

    expect(pageText()).toContain("Settings Center");
    expect(pageText()).toContain("Operator settings.");
    expect(pageText()).toContain("Attention");
    expect(pageText()).toContain("Auth bootstrap");
    expect(pageText()).not.toContain("Gmail Ingest");
    expect(pageText()).not.toContain("AUTH_SECRET");
    expect(pageText()).not.toContain("Auth secret");
    expect(pageText()).not.toContain("Clear saved setting");
    expect(pageText()).not.toContain("Diagnostics");
    expect(pageText()).not.toContain("No diagnostics captured");
    expect(pageText()).not.toContain("Next Actions");
    expect(pageText()).not.toContain("Action:");
    expect(pageText()).not.toContain("Test Mail Source");
    expect(pageText()).not.toContain("Run demo seed");
    expect(pageText()).not.toContain("Web public port");
    expect(pageText()).not.toContain("Runtime fallback");
    expect(pageText()).not.toContain("Demo mode");

    clickButton("Auth");
    expect(pageText()).toContain("Login logo URL");
    expect(pageText()).toContain("Workspace");
    expect(pageText()).toContain("OpenID Connect");
    expect(pageText()).toContain("https://inventory-dev.example.test/api/auth/oauth2/callback/workspace");
    clickButton("Copy callback URL");
    await act(async () => undefined);
    expect(writeText).toHaveBeenCalledWith("https://inventory-dev.example.test/api/auth/oauth2/callback/workspace");
    expect(pageText()).toContain("Callback URL copied.");

    clickButton("Juno Live");
    expect(pageText()).toContain("Juno login password");
    expect(pageText()).toContain("Secret value");
    expect(pageText()).toContain("Test session");
    expect(pageText()).not.toContain("Current secret");
    expect(pageText()).not.toContain("Read-only boundary");
  });

  it("formats preflight and connection statuses without raw enum values", () => {
    expect(formatJunoSessionCheckStatus("read_only_preflight_passed")).toBe("Session settings are ready.");
    expect(formatJunoSessionCheckStatus("missing_credentials")).toBe("Login credentials are missing.");
    expect(formatJunoSessionCheckStatus("unexpected_status")).toBe("Session settings need attention.");
    expect(formatJunoSessionCheckStatus("")).toBeUndefined();
    expect(formatJunoSessionCheckStatus(null)).toBeUndefined();

    expect(formatMailSourceTestStatus({
      ok: true,
      status: "connection_ready",
      provider: "gmail",
      mailboxAddress: "ops@example.test",
      query: "filename:xlsx",
      messageCount: 1,
    })).toBe("1 message matched.");
    expect(formatMailSourceTestStatus({
      ok: true,
      status: "connection_ready",
      provider: "gmail",
      mailboxAddress: "ops@example.test",
      query: "filename:xlsx",
      messageCount: 2,
    })).toBe("2 messages matched.");
    expect(formatMailSourceTestStatus({
      ok: false,
      status: "connection_failed",
      provider: "gmail",
      mailboxAddress: "ops@example.test",
      query: "filename:xlsx",
      error: "OAuth failed",
    })).toBe("OAuth failed");
    expect(formatMailSourceTestStatus({
      ok: false,
      status: "credential_missing",
      provider: "gmail",
      mailboxAddress: "ops@example.test",
      query: "filename:xlsx",
    })).toBe("Credential JSON is required.");
    expect(formatMailSourceTestStatus({
      ok: false,
      status: "invalid_configuration",
      provider: "gmail",
      mailboxAddress: "",
      query: "",
    })).toBe("Complete the required connection fields.");
    expect(formatMailSourceTestStatus({
      ok: false,
      status: "provider_not_implemented",
      provider: "imap",
      mailboxAddress: "ops@example.test",
      query: "filename:xlsx",
    })).toBe("This adapter cannot be tested yet.");
    expect(formatMailSourceTestStatus({
      ok: false,
      status: "connection_failed",
      provider: "gmail",
      mailboxAddress: "ops@example.test",
      query: "filename:xlsx",
    })).toBe("Connection failed.");

    expect(formatSettingsActionError("mail_source_connection_test_required", "Save failed")).toBe("Run a successful connection test before saving.");
    expect(formatSettingsActionError("notification_channel_not_found", "Channel failed")).toBe("Notification channel was not found.");
    expect(formatSettingsActionError("unknown_backend_code", "Action failed")).toBe("Action failed");
    expect(formatSettingsActionError("Readable backend message", "Action failed")).toBe("Readable backend message");
  });

  it("shows auth warnings in the attention-only overview", async () => {
    const settings = settingsFixture();
    settings.groups = settings.groups.map((group) => group.id === "auth" ? { ...group, state: "warning" } : group);
    settings.warnings = [
      {
        id: "auth_base_url_origin_mismatch",
        severity: "warning",
        message: "Site address does not match current origin.",
      },
    ];

    await renderSettingsPage(settings);

    expect(pageText()).toContain("Attention");
    expect(pageText()).toContain("Auth & Admin Access");
    expect(pageText()).toContain("Needs attention");
    expect(pageText()).toContain("Site address does not match current origin.");
    expect(pageText()).not.toContain("At least one admin user exists.");
  });

  it("saves settings and reports the result with Mantine notifications", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ settings: settingsFixture(), changed: ["juno_login_email"], warnings: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await renderSettingsPage(settingsFixture());
    clickButton("Juno Live");
    changeInput("Juno login email", "buyer@example.test");
    clickButton("Save Juno Live");
    await act(async () => undefined);

    expect(fetchMock).toHaveBeenCalledWith("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ juno: { juno_login_email: "buyer@example.test" } }),
    });
    expect(pageText()).toContain("Settings saved");
  });

  it("manages SSO providers through a list and modal actions", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ settings: settingsFixture(), changed: [], warnings: [] }))
      .mockResolvedValueOnce(jsonResponse({ settings: settingsFixture(), changed: [], warnings: [] }))
      .mockResolvedValueOnce(jsonResponse({ settings: settingsFixture(), changed: [], warnings: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await renderSettingsPage(settingsFixture());
    clickButton("Auth");
    clickButton("Add provider");
    await act(async () => undefined);
    expect(pageText()).toContain("Add SSO provider");
    expect(pageText()).toContain("Provider preset");
    expect(pageText()).not.toContain("OAuth 1.0");
    changeInput("Provider preset", "custom_oauth2");
    expect(pageText()).toContain("Authorization URL");
    expect(pageText()).toContain("Token URL");
    expect(pageText()).toContain("User info URL");

    changeInput("Provider ID", "dev-oidc");
    changeInput("Display name", "Dev OIDC");
    changeInput("Authorization URL", "https://login.example.test/oauth/authorize");
    changeInput("Token URL", "https://login.example.test/oauth/token");
    changeInput("User info URL", "https://login.example.test/oauth/userinfo");
    changeInput("Client ID", "client-id");
    changeInput("Client secret", "client-secret");
    clickButton("Create provider");
    await act(async () => undefined);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/settings/auth/sso-providers");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      providerId: "dev-oidc",
      displayName: "Dev OIDC",
      protocol: "oauth2",
      preset: "custom_oauth2",
      authorizationUrl: "https://login.example.test/oauth/authorize",
      tokenUrl: "https://login.example.test/oauth/token",
      userInfoUrl: "https://login.example.test/oauth/userinfo",
    });
    expect(pageText()).toContain("Provider created");

    const toggle = document.body.querySelector('input[aria-label="Workspace enabled"]') as HTMLInputElement;
    await act(async () => {
      toggle.click();
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/settings/auth/sso-providers");
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ id: "provider-1", enabled: false });

    clickButton("Delete");
    await act(async () => undefined);
    expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/settings/auth/sso-providers");
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toEqual({ id: "provider-1" });
  });

  it("manages mail sources from the Mail Sources tab", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        test: {
          ok: true,
          status: "connection_ready",
          provider: "gmail",
          mailboxAddress: "stock@example.test",
          query: "filename:xlsx",
          messageCount: 1,
        },
      }))
      .mockResolvedValueOnce(jsonResponse({ source: settingsFixture().mailSources[0] }))
      .mockResolvedValueOnce(jsonResponse(settingsFixture()))
      .mockResolvedValueOnce(jsonResponse({ source: { ...settingsFixture().mailSources[0], isActive: false } }))
      .mockResolvedValueOnce(jsonResponse(settingsFixture()));
    vi.stubGlobal("fetch", fetchMock);

    await renderSettingsPage(settingsFixture());
    clickButton("Mail Sources");
    expect(pageText()).toContain("Add source");
    expect(pageText()).toContain("Runnable ingest");
    expect(pageText()).not.toContain("Gmail Workspace Ingest");

    await clickButtonAndWait("Add source");
    expect(pageText()).toContain("Add mail source");
    expect(pageText()).toContain("Provider adapter");
    expect(pageText()).toContain("Connection");
    expect(pageText()).toContain("Ingest");
    expect(pageText()).toContain("Delegated inbox that receives supplier catalog emails.");
    expect(pageText()).toContain("Paste the Google service account JSON.");
    expect(pageText()).toContain("Gmail access uses a fixed read-only scope.");
    expect(pageText()).not.toContain("Gmail Workspace Scopes");
    expect(pageText()).not.toContain("Scopes");
    expect(pageText()).not.toContain("Credential reference");
    expect(pageText()).not.toContain("Runtime secret name");
    expect(findInput("Mailbox address").getAttribute("placeholder")).toBe("ops@example.com");
    expect(findInput("Query").getAttribute("placeholder")).toBe("filename:xlsx newer_than:7d");
    expect((findButton("Create source") as HTMLButtonElement).disabled).toBe(true);
    changeInput("Source name", "Supplier inbox");
    changeInput("Mailbox address", "stock@example.test");
    changeInput("Credential secret", "{\"client_email\":\"service@example.test\"}");
    clickButton("Test connection");
    await act(async () => undefined);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/mail-sources/test");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      name: "Supplier inbox",
      provider: "gmail",
      authType: "google_workspace_delegation",
      credentialType: "google_service_account_json",
      mailboxAddress: "stock@example.test",
      credentialSecret: "{\"client_email\":\"service@example.test\"}",
      scopes: "https://www.googleapis.com/auth/gmail.readonly",
    });
    expect(pageText()).toContain("Connection ready");
    expect((findButton("Create source") as HTMLButtonElement).disabled).toBe(false);
    clickButton("Create source");
    await act(async () => undefined);

    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/mail-sources");
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({
      name: "Supplier inbox",
      provider: "gmail",
      authType: "google_workspace_delegation",
      credentialType: "google_service_account_json",
      mailboxAddress: "stock@example.test",
      credentialSecret: "{\"client_email\":\"service@example.test\"}",
      scopes: "https://www.googleapis.com/auth/gmail.readonly",
      connectionTestPassed: true,
    });
    expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/settings");

    const toggle = document.body.querySelector('input[aria-label="Gmail source active"]') as HTMLInputElement | null;
    if (!toggle) {
      throw new Error(`Missing mail source active switch. Page text: ${pageText()}`);
    }
    await act(async () => {
      toggle.click();
    });
    expect(fetchMock.mock.calls[3]?.[0]).toBe("/api/mail-sources");
    expect(JSON.parse(String(fetchMock.mock.calls[3]?.[1]?.body))).toEqual({ id: "source-1", isActive: false });
  });

  it("manages notification channels and rules from the Notifications tab", async () => {
    const channels = [notificationChannelFixture()];
    const rules = [notificationRuleFixture()];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ channels }))
      .mockResolvedValueOnce(jsonResponse({ rules }))
      .mockResolvedValueOnce(jsonResponse({ channel: { ...channels[0], id: "channel-2", name: "Ops log", type: "logging" } }))
      .mockResolvedValueOnce(jsonResponse({ channels }))
      .mockResolvedValueOnce(jsonResponse({ rules }))
      .mockResolvedValueOnce(jsonResponse({ rule: { ...rules[0], enabled: false } }))
      .mockResolvedValueOnce(jsonResponse({ channels }))
      .mockResolvedValueOnce(jsonResponse({ rules: [{ ...rules[0], enabled: false }] }));
    vi.stubGlobal("fetch", fetchMock);

    await renderSettingsPage(settingsFixture());
    clickButton("Notifications");
    await act(async () => undefined);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/notifications/channels");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/notifications/rules");
    expect(pageText()).toContain("Notification Channels");
    expect(pageText()).toContain("Notification Rules");
    expect(pageText()).toContain("Flow");
    expect(pageText()).toContain("Add a channel, then add a rule that filters observed signals.");
    expect(pageText()).toContain("Add channel");
    expect(pageText()).toContain("Add rule");
    expect(pageText()).not.toContain("dashboard Notification Center");

    await clickButtonAndWait("Add channel");
    expect(findInput("Channel name").getAttribute("placeholder")).toBe("Ops in-app");
    changeInput("Channel name", "Ops log");
    changeInput("Channel type", "logging");
    clickButton("Create channel");
    await act(async () => undefined);
    expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/notifications/channels");
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toMatchObject({
      name: "Ops log",
      type: "logging",
      enabled: true,
      config: {},
    });

    const toggle = document.body.querySelector('input[aria-label="Watch hits rule enabled"]') as HTMLInputElement | null;
    if (!toggle) {
      throw new Error(`Missing notification rule switch. Page text: ${pageText()}`);
    }
    await act(async () => {
      toggle.click();
    });
    expect(fetchMock.mock.calls[5]?.[0]).toBe("/api/notifications/rules");
    expect(JSON.parse(String(fetchMock.mock.calls[5]?.[1]?.body))).toEqual({ id: "rule-1", enabled: false });
  });
});

async function renderSettingsPage(initialSettings: SettingsResponse | null = null, initialError: string | null = null): Promise<void> {
  await act(async () => {
    root.render(
      <MantineProvider defaultColorScheme="light" theme={theme}>
        <Notifications />
        <SettingsPage initialSettings={initialSettings} initialError={initialError} />
      </MantineProvider>,
    );
  });
  await act(async () => undefined);
}

function settingsFixture(): SettingsResponse {
  return {
    environment: {
      nodeEnv: "development",
      appBaseUrl: "https://inventory-dev.example.test",
      currentRequestOrigin: "https://inventory-dev.example.test",
      deploymentMode: "development",
      lastUpdatedAt: "2026-06-18T00:00:00.000Z",
      readOnlyBoundary: { noCart: true, noOrdering: true, noCheckout: true },
    },
    units: {
      authProvider: {
        id: "auth_provider",
        label: "Auth SSO Providers",
        status: "ready",
        providerCount: 1,
        enabledProviderCount: 1,
        readyProviderCount: 1,
        detail: "1 SSO provider ready for the Sign in page.",
        providers: [
          {
            id: "provider-1",
            providerId: "workspace",
            displayName: "Workspace",
            buttonLabel: "Continue with Workspace",
            logoUrl: null,
            protocol: "oidc",
            preset: "custom_oidc",
            enabled: true,
            status: "ready",
            discoveryUrl: "https://login.example.test/.well-known/openid-configuration",
            authorizationUrl: null,
            tokenUrl: null,
            userInfoUrl: null,
            clientId: "client-id",
            clientSecretConfigured: true,
            scopes: ["openid", "email", "profile"],
            callbackUrl: "https://inventory-dev.example.test/api/auth/oauth2/callback/workspace",
            adminEmailAllowlist: ["admin@example.test"],
            adminClaim: null,
            adminClaimValue: null,
            sortOrder: 0,
            missing: [],
            invalid: [],
          },
        ],
      },
      mail: {
        id: "mail_sources",
        label: "Mail sources",
        status: "ready",
        detail: "1 runnable mail source configured.",
        configured: true,
        optional: false,
      },
      junoLive: {
        id: "juno_live",
        label: "Read-only live lookup",
        status: "missing",
        detail: "Worker start is blocked until read-only login credentials and safe pacing are configured.",
        configured: false,
        optional: true,
      },
      notifications: {
        id: "notifications",
        label: "Notification delivery",
        status: "ready",
        detail: "In-app notifications are available. External webhook delivery remains opt-in.",
        configured: true,
        optional: true,
      },
    },
    security: {
      authBootstrap: {
        status: "ready",
        adminUserCount: 1,
        hasInitialAdminEnv: false,
        hasExternalAdminMapping: true,
        detail: "At least one admin user exists.",
      },
    },
    warnings: [],
    mailSources: [
      {
        id: "source-1",
        connectionId: "connection-1",
        name: "Gmail source",
        provider: "gmail",
        authType: "google_workspace_delegation",
        credentialType: "google_service_account_json",
        credentialReference: null,
        credentialConfigured: true,
        scopes: "https://www.googleapis.com/auth/gmail.readonly",
        mailboxAddress: "operator@example.test",
        displayName: "Operator",
        query: "filename:xlsx",
        maxResults: 25,
        lookbackMs: 604800000,
        processedLabel: "Processed",
        storageDir: ".data/mail",
        attachmentPattern: "xlsx",
        supplierCode: "juno",
        isActive: true,
      },
    ],
    nextActions: [
      {
        id: "open-settings-center",
        label: "Open Settings Center",
        detail: "Complete Juno Live before starting the worker.",
        href: "/settings",
        severity: "warning",
      },
    ],
    groups: [
      {
        id: "auth",
        label: "Auth",
        state: "complete",
        settings: [
          setting("auth_base_url", "Site address", "database", "configured", "https://inventory-dev.example.test", false, true, "url"),
          setting("auth_email_password_login_enabled", "Email/password login", "database", "configured", "Enabled", false, true, "boolean"),
          setting("auth_login_logo_url", "Login logo URL", "unset", "disabled", "Not set", false, true, "url"),
        ],
      },
      {
        id: "mail",
        label: "Mail Sources",
        state: "complete",
        settings: [],
      },
      {
        id: "juno",
        label: "Juno Live",
        state: "missing",
        settings: [
          setting("juno_login_email", "Juno login email", "unset", "missing", "Not configured", false, true, "email"),
          setting("juno_login_password", "Juno login password", "database", "configured", "Configured", true, true),
        ],
      },
      { id: "notifications", label: "Notifications", state: "complete", settings: [] },
    ],
  };
}

function setting(
  key: string,
  label: string,
  source: "database" | "runtime" | "default" | "unset",
  state: "configured" | "missing" | "disabled" | "invalid",
  displayValue: string,
  secret: boolean,
  editable: boolean,
  type: "string" | "number" | "boolean" | "email" | "url" | "csv" | "secret" = secret ? "secret" : "string",
) {
  return {
    key,
    label,
    value: secret ? null : displayValue,
    displayValue,
    source,
    state,
    secret,
    editable,
    clearable: source === "database" && editable,
    required: state === "missing",
    help: `${label} help`,
    type,
    runtimeOnly: !editable,
    advanced: false,
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function notificationChannelFixture() {
  return {
    id: "channel-1",
    name: "In-app",
    type: "in_app",
    enabled: true,
    config: {},
    secretRef: null,
    configSummary: "Dashboard-only read-only alerts",
    createdAt: "2026-06-18T00:00:00.000Z",
    updatedAt: "2026-06-18T00:00:00.000Z",
  };
}

function notificationRuleFixture() {
  return {
    id: "rule-1",
    name: "Watch hits",
    channelId: "channel-1",
    channelName: "In-app",
    channelType: "in_app",
    channelEnabled: true,
    enabled: true,
    signalTypes: ["watch_hit"],
    severities: ["watch"],
    minScore: 10,
    includeWatchHits: true,
    includeDigest: false,
    cooldownMinutes: 60,
    createdAt: "2026-06-18T00:00:00.000Z",
    updatedAt: "2026-06-18T00:00:00.000Z",
  };
}

function pageText(): string {
  return document.body.textContent ?? "";
}

function clickButton(name: string): void {
  const button = findButton(name);
  act(() => {
    clickElement(button);
  });
}

async function clickButtonAndWait(name: string): Promise<void> {
  const button = findButton(name);
  await act(async () => {
    clickElement(button);
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

function findButton(name: string): HTMLElement {
  const matches = [...document.body.querySelectorAll("button,[role='tab']")]
    .find((element) => element.textContent?.trim() === name);
  const button = [...document.body.querySelectorAll("button,[role='tab']")]
    .filter((element) => element.textContent?.trim() === name)
    .at(-1) ?? matches;
  if (!button) {
    throw new Error(`Missing button ${name}. Page text: ${pageText()}`);
  }
  return button as HTMLElement;
}

function clickElement(element: HTMLElement): void {
  const propsKey = Object.keys(element).find((key) => key.startsWith("__reactProps"));
  const props = propsKey
    ? (element as unknown as Record<string, { onClick?: (event: unknown) => void }>)[propsKey]
    : null;
  if (typeof props?.onClick === "function") {
    flushSync(() => props.onClick?.({
      button: 0,
      currentTarget: element,
      defaultPrevented: false,
      isDefaultPrevented: () => false,
      isPropagationStopped: () => false,
      nativeEvent: new MouseEvent("click", { bubbles: true, cancelable: true, composed: true }),
      persist() {},
      target: element,
      preventDefault() {},
      stopPropagation() {},
    }));
    return;
  }
  element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, composed: true }));
}

function changeInput(label: string, value: string): void {
  const input = findInput(label);
  act(() => {
    const prototype = input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : input instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function findInput(label: string): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  const input = document.body.querySelector(`[aria-label="${label}"]`) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null
    ?? [...document.body.querySelectorAll("label")]
      .find((element) => element.textContent?.trim() === label)
      ?.parentElement?.querySelector("input,textarea,select") as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
  if (!input) {
    throw new Error(`Missing input ${label}. Page text: ${pageText()}`);
  }
  return input;
}

function setReactActEnvironment() {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
}
