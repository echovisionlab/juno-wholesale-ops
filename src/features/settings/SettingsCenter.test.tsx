/* @vitest-environment jsdom */

import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { act } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import {
  notificationChannelFixture,
  notificationRuleFixture,
  settingsFixture,
} from "./settings.fixtures";
import type { SettingsResponse } from "@/lib/settings/descriptors";
import { theme } from "@/theme";
import {
  formatJunoSessionCheckStatus,
  formatMailSourceTestStatus,
  formatSettingsActionError,
  SettingsCenter,
} from "./SettingsCenter";

let root: Root;
let container: HTMLDivElement;

describe("SettingsCenter", () => {
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

  it("renders Settings Center sections without exposing raw secrets", async () => {
    const writeText = vi.fn().mockResolvedValueOnce(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    await renderSettingsPage(settingsFixture());

    expect(pageText()).toContain("Settings Center");
    expect(pageText()).toContain("Operator settings.");
    expect(pageText()).toContain("Attention");
    expect(pageText()).not.toContain("AUTH_SECRET");

    clickButton("Auth");
    expect(pageText()).toContain("Login logo URL");
    expect(pageText()).not.toContain("AUTH_SECRET");
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
  });

  it("selects the Auth tab through DOM click and keyboard navigation", async () => {
    await renderSettingsPage(settingsFixture());

    expect(selectedTab()).toBe("Overview");

    await clickTabDom("Auth");

    expect(selectedTab()).toBe("Auth");
    expect(pageText()).toContain("External SSO Providers");

    await clickTabDom("Overview");
    expect(selectedTab()).toBe("Overview");

    await keyDownTab("Overview", "ArrowRight");

    expect(selectedTab()).toBe("Auth");
    expect(pageText()).toContain("External SSO Providers");
  });

  it("shows unresolved SSO secret references only as an actionable problem", async () => {
    const settings = settingsFixture();
    settings.units.authProvider.providers = settings.units.authProvider.providers.map((provider) => ({
      ...provider,
      status: "missing",
      clientSecretRef: "env:MISSING_WORKSPACE_CLIENT_SECRET",
      missing: ["client secret"],
    }));

    await renderSettingsPage(settings);
    clickButton("Auth");

    expect(pageText()).toContain("Client secret unavailable: env:MISSING_WORKSPACE_CLIENT_SECRET");
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
    })).toBe("1 message matched; storage checked.");
    expect(formatMailSourceTestStatus({
      ok: true,
      status: "connection_ready",
      provider: "gmail",
      mailboxAddress: "ops@example.test",
      query: "filename:xlsx",
      messageCount: 2,
    })).toBe("2 messages matched; storage checked.");
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
    expect(formatSettingsActionError("clientSecretRef must use env:NAME or file:/absolute/path", "Save failed")).toBe(
      "Use env:NAME or file:/absolute/path for the client secret reference.",
    );
    expect(formatSettingsActionError("clientSecretRef is required when creating a provider", "Save failed")).toBe(
      "Add a client secret reference before creating the provider.",
    );
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
    expect(pageText()).toContain("Review Auth tab.");
    expect(pageText()).toContain("Site address does not match current origin.");
    expect(pageText()).not.toContain("At least one admin user exists.");
  });

  it("uses fresh server-loaded settings after a route-key remount", async () => {
    const refreshedSettings = settingsFixture();
    refreshedSettings.warnings = [
      {
        id: "refreshed-settings-warning",
        severity: "warning",
        message: "Settings changed after refresh.",
      },
    ];

    await renderSettingsPage(settingsFixture(), null, { renderKey: "initial" });
    expect(pageText()).not.toContain("Settings changed after refresh.");

    await renderSettingsPage(refreshedSettings, null, { renderKey: "refreshed" });
    expect(pageText()).toContain("Settings changed after refresh.");
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
    changeInput("Client secret reference", "env:DEV_OIDC_CLIENT_SECRET");
    clickButton("Create provider");
    await act(async () => undefined);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/settings/auth/sso-providers");
    const createProviderPayload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(createProviderPayload).toMatchObject({
      providerId: "dev-oidc",
      displayName: "Dev OIDC",
      protocol: "oauth2",
      preset: "custom_oauth2",
      authorizationUrl: "https://login.example.test/oauth/authorize",
      tokenUrl: "https://login.example.test/oauth/token",
      userInfoUrl: "https://login.example.test/oauth/userinfo",
      clientSecretRef: "env:DEV_OIDC_CLIENT_SECRET",
    });
    expect(createProviderPayload).not.toHaveProperty("clientSecret");
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
    expect(pageText()).toContain("Only Gmail Workspace can be saved now. Planned adapters are disabled.");
    expect(pageText()).toContain("Gmail Workspace");
    expect(pageText()).toContain("IMAP (planned)");
    expect(pageText()).toContain("Microsoft Graph (planned)");
    expect(pageText()).toContain("Generic mailbox (planned)");
    expect(pageText()).toContain("Connection");
    expect(pageText()).toContain("Ingest");
    expect(pageText()).toContain("Attachment Storage");
    expect(pageText()).toContain("Delegated inbox that receives supplier catalog emails.");
    expect(pageText()).toContain("Paste the Google service account JSON.");
    expect(pageText()).toContain("Gmail access uses a fixed read-only scope.");
    expect(pageText()).toContain("Read-only scope");
    expect(findInput("Mailbox address").getAttribute("placeholder")).toBe("catalogs@example.com");
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
      storageBackend: "local_drive",
      storageDir: ".data/mail",
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
      storageBackend: "local_drive",
      storageDir: ".data/mail",
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
      .mockResolvedValueOnce(jsonResponse({ queued: 1, skipped: 0 }))
      .mockResolvedValueOnce(jsonResponse({ channels }))
      .mockResolvedValueOnce(jsonResponse({ rules }))
      .mockResolvedValueOnce(jsonResponse({ sent: 1, failed: 0, skipped: 0, dryRun: false }))
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
    expect(pageText()).toContain("Queue");
    expect(pageText()).toContain("Dry-run dispatch");
    expect(pageText()).toContain("Send queued");
    expect(pageText()).toContain("Local delivery");
    expect(pageText()).toContain("External webhooks");
    expect(pageText()).toContain("External send");
    expect(pageText()).toContain("In-app and logging channels are normal local delivery.");
    expect(pageText()).toContain("Add channel");
    expect(pageText()).toContain("Add rule");
    expect(pageText()).not.toContain("dashboard Notification Center");

    clickButton("Queue");
    await act(async () => undefined);
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
    expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/notifications/queue");
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toMatchObject({ mode: "dry-run", limit: 100 });

    clickButton("Send queued");
    await act(async () => undefined);
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
    expect(fetchMock.mock.calls[5]?.[0]).toBe("/api/notifications/dispatch");
    expect(JSON.parse(String(fetchMock.mock.calls[5]?.[1]?.body))).toMatchObject({ mode: "send", limit: 100 });

    await clickButtonAndWait("Add channel");
    expect(findInput("Channel name").getAttribute("placeholder")).toBe("Ops in-app");
    expect(pageText()).toContain("Slack-style webhook");
    expect(pageText()).toContain("Discord-style webhook");
    expect(pageText()).toContain("Telegram-style webhook");
    changeInput("Channel name", "Ops log");
    changeInput("Provider", "logging");
    clickButton("Create channel");
    await act(async () => undefined);
    expect(fetchMock.mock.calls[8]?.[0]).toBe("/api/notifications/channels");
    expect(JSON.parse(String(fetchMock.mock.calls[8]?.[1]?.body))).toMatchObject({
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
    expect(fetchMock.mock.calls[11]?.[0]).toBe("/api/notifications/rules");
    expect(JSON.parse(String(fetchMock.mock.calls[11]?.[1]?.body))).toEqual({ id: "rule-1", enabled: false });
  });

  it("renders injected notification resources without loading from the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await renderSettingsPage(settingsFixture(), null, {
      initialTab: "notifications",
      initialNotificationChannels: [notificationChannelFixture()],
      initialNotificationRules: [notificationRuleFixture()],
    });

    expect(pageText()).toContain("Notification Channels");
    expect(pageText()).toContain("Notification Rules");
    expect(pageText()).toContain("Watch hits");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps in-app-only and missing webhook destinations out of warning state", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await renderSettingsPage(settingsFixture(), null, {
      initialTab: "notifications",
      initialNotificationChannels: [
        notificationChannelFixture(),
        {
          ...notificationChannelFixture(),
          id: "channel-webhook",
          name: "Optional webhook",
          type: "webhook",
          config: { format: "generic" },
          secretRef: null,
          configSummary: "Generic webhook not configured",
        },
      ],
      initialNotificationRules: [notificationRuleFixture()],
    });

    expect(pageText()).toContain("1 in-app/logging");
    expect(pageText()).toContain("1 need URL before send");
    expect(pageText()).toContain("Generic webhook not configured");
    expect(pageText()).toContain("Missing webhook URLs only block webhook send attempts");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

async function renderSettingsPage(
  initialSettings: SettingsResponse | null = null,
  initialError: string | null = null,
  props: Partial<ComponentProps<typeof SettingsCenter>> & { renderKey?: string } = {},
): Promise<void> {
  const { renderKey, ...componentProps } = props;
  await act(async () => {
    root.render(
      <MantineProvider defaultColorScheme="light" theme={theme}>
        <Notifications />
        <SettingsCenter key={renderKey} initialSettings={initialSettings} initialError={initialError} {...componentProps} />
      </MantineProvider>,
    );
  });
  await act(async () => undefined);
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
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

function findTab(name: string): HTMLElement {
  const tab = [...document.body.querySelectorAll<HTMLElement>("[role='tab']")]
    .find((element) => element.textContent?.trim() === name);
  if (!tab) {
    throw new Error(`Missing tab ${name}. Page text: ${pageText()}`);
  }
  return tab;
}

function selectedTab(): string | null {
  return [...document.body.querySelectorAll<HTMLElement>("[role='tab']")]
    .find((element) => element.getAttribute("aria-selected") === "true")
    ?.textContent
    ?.trim() ?? null;
}

async function clickTabDom(name: string): Promise<void> {
  const tab = findTab(name);
  await act(async () => {
    tab.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, composed: true }));
  });
  await act(async () => undefined);
}

async function keyDownTab(name: string, key: string): Promise<void> {
  const tab = findTab(name);
  await act(async () => {
    tab.focus();
    tab.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, composed: true }));
  });
  await act(async () => undefined);
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
