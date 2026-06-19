/* @vitest-environment jsdom */

import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SettingsResponse } from "@/lib/settings/descriptors";
import { theme } from "@/theme";
import { SettingsPage } from "./SettingsPage";

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
    expect(pageText()).toContain("Read-only operator settings.");
    expect(pageText()).toContain("Auth bootstrap");
    expect(pageText()).not.toContain("AUTH_SECRET");
    expect(pageText()).not.toContain("Auth secret");
    expect(pageText()).not.toContain("Clear saved setting");
    expect(pageText()).not.toContain("Diagnostics");
    expect(pageText()).not.toContain("No diagnostics captured");
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
    expect(pageText()).toContain("Current secret: Configured");
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
        detail: "1 runnable Gmail source configured.",
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
      { id: "notifications", label: "Notifications", state: "disabled", settings: [] },
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

function pageText(): string {
  return document.body.textContent ?? "";
}

function clickButton(name: string): void {
  const matches = [...document.body.querySelectorAll("button,[role='tab']")]
    .find((element) => element.textContent?.trim() === name);
  const button = [...document.body.querySelectorAll("button,[role='tab']")]
    .filter((element) => element.textContent?.trim() === name)
    .at(-1) ?? matches;
  if (!button) {
    throw new Error(`Missing button ${name}. Page text: ${pageText()}`);
  }
  act(() => {
    (button as HTMLElement).click();
  });
}

function changeInput(label: string, value: string): void {
  const input = document.body.querySelector(`[aria-label="${label}"]`) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null
    ?? [...document.body.querySelectorAll("label")]
      .find((element) => element.textContent?.trim() === label)
      ?.parentElement?.querySelector("input,textarea,select") as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
  if (!input) {
    throw new Error(`Missing input ${label}. Page text: ${pageText()}`);
  }
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

function setReactActEnvironment() {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
}
