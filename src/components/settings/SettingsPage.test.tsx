/* @vitest-environment jsdom */

import { MantineProvider } from "@mantine/core";
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

  it("renders source badges and masked secrets without raw values", async () => {
    await renderSettingsPage(settingsFixture());

    expect(pageText()).toContain("Settings Center");
    expect(pageText()).toContain("Read-only observation only");
    expect(pageText()).toContain("Auth bootstrap");
    expect(pageText()).not.toContain("AUTH_SECRET");
    expect(pageText()).not.toContain("Auth secret");
    clickButton("Auth");
    expect(pageText()).toContain("Login logo URL");
    expect(pageText()).toContain("Continue with Workspace");
    expect(pageText()).toContain("https://inventory-dev.example.test/api/auth/callback/workspace");
    expect(pageText()).toContain("Copy callback URL");
    expect(pageText()).toContain("Client secret");
    expect(pageText()).toContain("configured");
    expect(pageText()).not.toContain("raw-db-secret");
    clickButton("Overview");
    expect(pageText()).toContain("database");
    expect(pageText()).toContain("runtime");
    expect(pageText()).toContain("default");
    clickButton("Juno Live");
    expect(pageText()).toContain("unset");
    expect(pageText()).toContain("Database override configured");
    clickButton("Advanced");
    expect(pageText()).toContain("Runtime fallback configured");
    expect(pageText()).not.toContain("raw-db-secret");
    expect(pageText()).not.toContain("raw-runtime-secret");
  });

  it("clears a database override with a null patch and masks action results", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ settings: settingsFixture({ junoPasswordSource: "runtime" }), changed: ["juno_login_password"], warnings: [] }))
      .mockResolvedValueOnce(jsonResponse({ ok: false, status: "missing_settings", service_account: "raw-secret-token" }));
    vi.stubGlobal("fetch", fetchMock);

    await renderSettingsPage(settingsFixture());
    clickButton("Juno Live");
    await act(async () => undefined);
    clickButton("Clear override");
    await act(async () => undefined);

    expect(fetchMock).toHaveBeenCalledWith("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ juno: { juno_login_password: null } }),
    });
    expect(pageText()).toContain("Runtime fallback configured");

    clickButton("Overview");
    clickButton("Test Mail Source");
    await act(async () => undefined);
    expect(pageText()).toContain("[redacted]");
    expect(pageText()).not.toContain("raw-secret-token");
  });
});

async function renderSettingsPage(initialSettings: SettingsResponse | null = null, initialError: string | null = null): Promise<void> {
  await act(async () => {
    root.render(
      <MantineProvider defaultColorScheme="light" theme={theme}>
        <SettingsPage initialSettings={initialSettings} initialError={initialError} />
      </MantineProvider>,
    );
  });
  await act(async () => undefined);
}

function settingsFixture(options: { junoPasswordSource?: "database" | "runtime" } = {}): SettingsResponse {
  const junoPasswordSource = options.junoPasswordSource ?? "database";
  return {
    environment: {
      nodeEnv: "development",
      appBaseUrl: "https://inventory-dev.example.test",
      currentRequestOrigin: "https://inventory-dev.example.test",
      deploymentMode: "development",
      lastUpdatedAt: "2026-06-18T00:00:00.000Z",
      readOnlyBoundary: { noCart: true, noOrdering: true, noCheckout: true },
    },
    dataMode: {
      value: "demo",
      source: "default",
      status: "demo",
      detail: "Synthetic demo data mode. Mail sources are optional.",
    },
    units: {
      authProvider: {
        id: "auth_provider",
        label: "Auth Provider",
        providerType: "generic_oauth_oidc",
        enabled: true,
        status: "ready",
        displayName: "Workspace",
        buttonLabel: "Continue with Workspace",
        providerId: "workspace",
        logoUrl: null,
        discoveryUrl: "https://login.example.test/.well-known/openid-configuration",
        clientId: "client-id",
        clientSecretConfigured: true,
        scopes: ["openid", "email", "profile"],
        callbackUrl: "https://inventory-dev.example.test/api/auth/callback/workspace",
        adminEmailAllowlistConfigured: true,
        adminClaimMappingConfigured: false,
        detail: "Generic OAuth/OIDC sign-in is ready.",
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
        id: "system",
        label: "System",
        state: "complete",
        settings: [
          setting("database_url", "Database URL", "runtime", "configured", "Runtime fallback configured", true, false),
        ],
      },
      {
        id: "auth",
        label: "Auth",
        state: "complete",
        settings: [
          setting("auth_base_url", "Auth base URL", "database", "configured", "https://inventory-dev.example.test", false, true, "url"),
          setting("auth_login_logo_url", "Login logo URL", "unset", "disabled", "Not set", false, true, "url"),
          setting("auth_external_client_secret", "External client secret", "database", "configured", "Database override configured", true, true),
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
          {
            ...setting(
              "juno_login_password",
              "Juno login password",
              junoPasswordSource,
              "configured",
              junoPasswordSource === "database" ? "Database override configured" : "Runtime fallback configured",
              true,
              true,
            ),
            clearable: junoPasswordSource === "database",
          },
        ],
      },
      { id: "notifications", label: "Notifications", state: "disabled", settings: [] },
      {
        id: "advanced",
        label: "Advanced",
        state: "missing",
        settings: [
          setting("database_url", "Database URL", "runtime", "configured", "Runtime fallback configured", true, false),
          setting("auth_base_url", "Auth base URL", "database", "configured", "https://inventory-dev.example.test", false, true, "url"),
          setting("auth_login_logo_url", "Login logo URL", "unset", "disabled", "Not set", false, true, "url"),
          setting("auth_external_client_secret", "External client secret", "database", "configured", "Database override configured", true, true),
          setting("juno_login_email", "Juno login email", "unset", "missing", "Not configured", false, true, "email"),
          setting("juno_login_password", "Juno login password", junoPasswordSource, "configured", junoPasswordSource === "database" ? "Database override configured" : "Runtime fallback configured", true, true),
        ],
      },
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

function clickButton(name: string): void {
  const button = Array.from(document.querySelectorAll("button")).find((entry) => entry.textContent?.includes(name));
  if (!button) {
    throw new Error(`Missing button ${name}`);
  }
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function pageText(): string {
  return document.body.textContent ?? "";
}

function setReactActEnvironment(): void {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
}
