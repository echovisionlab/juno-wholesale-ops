/* @vitest-environment jsdom */

import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { act } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  notificationChannelFixture,
  notificationRuleFixture,
  settingsFixture,
} from "@/features/settings/settings.fixtures";
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
    expect(pageText()).toContain("Attachment Storage");
    expect(pageText()).toContain("Delegated inbox that receives supplier catalog emails.");
    expect(pageText()).toContain("Paste the Google service account JSON.");
    expect(pageText()).toContain("Gmail access uses a fixed read-only scope.");
    expect(pageText()).not.toContain("Gmail Workspace Scopes");
    expect(pageText()).not.toContain("Scopes");
    expect(pageText()).not.toContain("Credential reference");
    expect(pageText()).not.toContain("Runtime secret name");
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
