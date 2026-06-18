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
    expect(pageText()).toContain("Read-only: no cart, no ordering, no checkout");
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
    clickButton("Test Gmail");
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
      deploymentMode: "development",
      lastUpdatedAt: "2026-06-18T00:00:00.000Z",
      readOnlyBoundary: { noCart: true, noOrdering: true, noCheckout: true },
    },
    warnings: [],
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
          setting("auth_secret", "Auth secret", "runtime", "configured", "Runtime fallback configured", true, false),
        ],
      },
      {
        id: "auth",
        label: "Auth",
        state: "complete",
        settings: [
          setting("auth_base_url", "Auth base URL", "database", "configured", "https://inventory-dev.example.test", false, true, "url"),
        ],
      },
      {
        id: "gmail",
        label: "Gmail Ingest",
        state: "missing",
        settings: [
          setting("google_service_account_key_json", "Service account key", "database", "configured", "Database override configured", true, true),
          setting("google_gmail_scopes", "Gmail scopes", "default", "configured", "https://www.googleapis.com/auth/gmail.readonly", false, true, "csv"),
        ],
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
          setting("google_gmail_scopes", "Gmail scopes", "default", "configured", "https://www.googleapis.com/auth/gmail.readonly", false, true, "csv"),
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
