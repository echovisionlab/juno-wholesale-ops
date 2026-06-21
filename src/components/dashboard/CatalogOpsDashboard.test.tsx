/* @vitest-environment jsdom */

import { MantineProvider } from "@mantine/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { theme } from "@/theme";
import {
  dashboardPanelLayoutStorageKey,
  getDashboardPanelDefinition,
  optionalDashboardPanelDefinitions,
} from "@/lib/dashboard/panel-layout";
import {
  CatalogOpsDashboard,
  dashboardOptionalPanelRenderRegistry,
  type CatalogOpsDashboardProps,
} from "./CatalogOpsDashboard";
import { dashboardFixture } from "./dashboard.fixtures";

let root: Root;
let container: HTMLDivElement;

describe("CatalogOpsDashboard", () => {
  beforeEach(() => {
    setReactActEnvironment();
    installTestLocalStorage();
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
    window.localStorage.clear();
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
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("keeps optional panel rendering aligned with stored panel definitions", () => {
    expect(dashboardOptionalPanelRenderRegistry.map((panel) => panel.id)).toEqual(
      optionalDashboardPanelDefinitions.map((definition) => definition.id),
    );
    for (const panelId of ["todaySignals", "movementSignals", "operatorDigest", "catalogTrends"] as const) {
      expect(getDashboardPanelDefinition(panelId).explanation).toEqual({
        dataSource: expect.any(String),
        calculation: expect.any(String),
        expectation: expect.any(String),
      });
    }
  });

  it("renders unavailable setup, ingest, live stock, and worker states", () => {
    renderDashboard({
      stats: dashboardFixture.stats,
      pipeline: dashboardFixture.pipeline,
      commands: dashboardFixture.commands,
    });

    expect(pageText()).toContain("Setup status unavailable");
    expect(pageText()).toContain("Mail ingest status unavailable");
    expect(pageText()).toContain("Today signals unavailable");
    expect(pageText()).toContain("Movement signals unavailable");
    expect(pageText()).toContain("Catalog trends unavailable");
    expect(pageText()).toContain("Operator digest unavailable");
    expect(pageText()).toContain("Watch rules unavailable");
    expect(pageText()).toContain("Notification center unavailable");
    expect(pageText()).toContain("Notification rules unavailable");
    expect(pageText()).toContain("Notification channels unavailable");
    expect(pageText()).toContain("Queued / Running");
    expect(pageText()).toContain("N/A");
    expect(pageText()).toContain("worker status unavailable");
  });

  it("renders successful ingest and complete setup data", () => {
    renderDashboard(dashboardFixture);

    expect(pageText()).toContain("Succeeded");
    expect(pageText()).toContain("finished");
    expect(pageText()).toContain("2 / 1");
    expect(pageText()).toContain("2026-06-17");
    expect(pageText()).toContain("snapshot 4e02b7c8");
    expect(pageText()).toContain("75fba5fd45...5d2a7a");
    expect(pageText()).toContain("Configuration action required");
    expect(pageText()).toContain("Migration ledger");
    expect(pageText()).toContain("Watch hit: Lara Voss - Signal Path");
    expect(pageText()).toContain("Low observed stock");
    expect(pageText()).toContain("Movement Signals");
    expect(pageText()).toContain("Data: Today signal events joined to catalog rows and watch-match reasons.");
    expect(pageText()).toContain("Observed stock change");
    expect(pageText()).toContain("Fast mover candidate");
    expect(pageText()).toContain("Catalog Trends");
    expect(pageText()).toContain("Top Genres");
    expect(pageText()).toContain("Watch Overlap");
    expect(pageText()).toContain("Operator Digest");
    expect(pageText()).toContain("Restock observations");
    expect(pageText()).toContain("Signal Filters");
    expect(pageText()).toContain("Watch hits");
    expect(pageText()).toContain("Low stock review");
    expect(pageText()).toContain("Notification Center");
    expect(pageText()).toContain("[Watch hit] Lara Voss - Signal Path");
    expect(pageText()).toContain("Notification Rules");
    expect(pageText()).toContain("Watch and movement alerts");
    expect(pageText()).toContain("Notification Channels");
    expect(pageText()).toContain("Webhook URL from JUNO_OPS_WEBHOOK_URL");
    expect(pageText()).toContain("Blue Note");
    expect(pageText()).toContain("Exclude keyword");
  });

  it("renders empty insights states and dispatches watch rule actions", () => {
    const onCreateWatchRule = vi.fn();
    const onToggleWatchRule = vi.fn();
    const onDeleteWatchRule = vi.fn();

    renderDashboard({
      ...dashboardFixture,
      todaySignals: [],
      movementSignals: [],
      catalogTrends: {
        window: {
          currentFrom: "2026-06-11T00:00:00.000Z",
          currentTo: "2026-06-18T00:00:00.000Z",
          previousFrom: "2026-06-04T00:00:00.000Z",
          previousTo: "2026-06-11T00:00:00.000Z",
        },
        genres: [],
        labels: [],
        watchOverlap: [],
      },
      watchRules: [],
      notificationDeliveries: [],
      notificationRules: [],
      notificationChannels: [],
      onCreateWatchRule,
      onToggleWatchRule,
      onDeleteWatchRule,
    });

    expect(pageText()).toContain("No observed signals today");
    expect(pageText()).toContain("No movement signals recorded");
    expect(pageText()).toContain("No observed catalog trend rows in this window");
    expect(pageText()).toContain("No watch rules configured");
    expect(pageText()).toContain("No read-only alerts queued");
    expect(pageText()).toContain("No notification rules configured");
    expect(pageText()).toContain("No notification channels configured");
    setInputValue('input[placeholder="Artist, label, genre, or keyword"]', "Impulse");
    clickButton("Add rule");
    expect(onCreateWatchRule).toHaveBeenCalledWith({ type: "artist", pattern: "Impulse", weight: null });
    setSelectValue('select[aria-label="Watch rule type"]', "exclude_keyword");
    setInputValue('input[placeholder="Artist, label, genre, or keyword"]', "Damaged sleeve");
    setInputValue('input[placeholder="-10"]', "-12");
    clickButton("Add rule");
    expect(onCreateWatchRule).toHaveBeenCalledWith({
      type: "exclude_keyword",
      pattern: "Damaged sleeve",
      weight: -12,
    });

    renderDashboard({
      ...dashboardFixture,
      onCreateWatchRule,
      onToggleWatchRule,
      onDeleteWatchRule,
    });
    clickByAriaLabel("Toggle Blue Note");
    clickByAriaLabel("Delete Blue Note");
    expect(onToggleWatchRule).toHaveBeenCalledWith(expect.objectContaining({ id: "watch-rule-1" }));
    expect(onDeleteWatchRule).toHaveBeenCalledWith(expect.objectContaining({ id: "watch-rule-1" }));

    renderDashboard({
      ...dashboardFixture,
      todaySignals: [
        {
          ...dashboardFixture.todaySignals![0],
          signalId: "signal-new-arrival",
          type: "new_arrival",
          severity: "info",
          title: "New catalog arrival: 1148569-01",
          detail: "First observed in this XLSX catalog snapshot.",
        },
        {
          ...dashboardFixture.todaySignals![0],
          signalId: "signal-exclude",
          type: "exclude_match",
          severity: "critical",
          item: {
            ...dashboardFixture.todaySignals![0].item,
            artist: null,
            title: null,
            label: null,
            genre: null,
            stock: null,
            junoId: null,
          },
          reasons: [],
        },
      ],
      movementSignals: [
        {
          ...dashboardFixture.movementSignals![0],
          signalId: "movement-restock",
          type: "observed_restock",
          detail: "Live lookup changed from out_of_stock to in_stock for this item.",
        },
        {
          ...dashboardFixture.movementSignals![0],
          signalId: "movement-low",
          type: "observed_live_low_stock",
          detail: "Live lookup observed 2 units in stock.",
          item: {
            ...dashboardFixture.movementSignals![0].item,
            stock: null,
            junoId: null,
          },
        },
        {
          ...dashboardFixture.movementSignals![0],
          signalId: "movement-status",
          type: "observed_status_change",
          detail: "Live lookup status changed from preorder to in_stock.",
        },
        {
          ...dashboardFixture.movementSignals![0],
          signalId: "movement-price",
          type: "observed_price_change",
          detail: "Observed wholesale price changed from GBP 10.00 to GBP 11.00.",
        },
        {
          ...dashboardFixture.movementSignals![0],
          signalId: "movement-trend",
          type: "trend_spike",
          detail: "Catalog trend spike: Jazz appeared 9 times in the current window.",
        },
      ],
      watchRules: [
        {
          ...dashboardFixture.watchRules![0],
          type: "artist",
          pattern: "Lara Voss",
          patternNorm: "lara voss",
        },
        {
          ...dashboardFixture.watchRules![0],
          type: "keyword",
          pattern: "Warehouse Find",
          patternNorm: "warehouse find",
          enabled: false,
        },
      ],
      notificationDeliveries: [
        {
          ...dashboardFixture.notificationDeliveries![0],
          id: "delivery-failed",
          status: "failed",
          signalType: "observed_price_change",
          lastError: "webhook responded with status 500",
        },
        {
          ...dashboardFixture.notificationDeliveries![0],
          id: "delivery-skipped",
          status: "skipped",
          signalType: null,
          score: null,
          channelName: null,
          ruleName: null,
        },
      ],
      notificationRules: [
        {
          ...dashboardFixture.notificationRules![0],
          id: "notification-disabled",
          enabled: false,
          channelType: "logging",
          channelName: "Audit log",
          signalTypes: [],
          severities: [],
          includeDigest: true,
        },
      ],
      notificationChannels: [
        {
          ...dashboardFixture.notificationChannels![0],
          id: "notification-logging",
          type: "logging",
          name: "Audit log",
          enabled: false,
          configSummary: "Console JSON read-only alert log",
        },
      ],
      watchRuleActionPending: true,
    });
    expect(pageText()).toContain("not reported");
    expect(pageText()).toContain("New arrival");
    expect(pageText()).toContain("Exclude match");
    expect(pageText()).toContain("Observed restock");
    expect(pageText()).toContain("Low live stock");
    expect(pageText()).toContain("Observed status change");
    expect(pageText()).toContain("Observed price change");
    expect(pageText()).toContain("Catalog trend spike");
    expect(pageText()).toContain("Warehouse Find");
    expect(pageText()).toContain("Off");
    expect(pageText()).toContain("Failed");
    expect(pageText()).toContain("Skipped");
    expect(pageText()).toContain("Operator digest");
    expect(pageText()).toContain("Logging");
    expect(pageText()).toContain("Console JSON read-only alert log");
  });

  it("renders running, failed, and not-run ingest variants", () => {
    renderDashboard({
      ...dashboardFixture,
      ingestState: {
        ...emptyIngestState(),
        lastQueryStatus: "running",
        lastQueryStartedAt: "2026-06-17T01:00:00.000Z",
        lastIngestedContentHash: "short-hash",
        lastQueryWindowTo: "2026-06-17T02:00:00.000Z",
      },
    });
    expect(pageText()).toContain("Running");
    expect(pageText()).toContain("started");
    expect(pageText()).toContain("short-hash");

    renderDashboard({
      ...dashboardFixture,
      ingestState: {
        ...emptyIngestState(),
        lastQueryStatus: "failed",
        lastQueryError: "Gmail API failed",
      },
    });
    expect(pageText()).toContain("Failed");
    expect(pageText()).toContain("Last run failed");
    expect(pageText()).toContain("Gmail API failed");
    expect(pageText()).toContain("no stored snapshot yet");

    renderDashboard({
      ...dashboardFixture,
      ingestState: emptyIngestState(),
    });
    expect(pageText()).toContain("Not run");
    expect(pageText()).toContain("no recorded mail ingest run");
  });

  it("renders setup actions and guardrails without resolved setting values", () => {
    renderDashboard({
      ...dashboardFixture,
      setupStatus: {
        ready: true,
        steps: [
          {
            id: "database",
            label: "Database",
            state: "warning",
            detail: "database detail",
            action: null,
            missing: [],
            settings: [
              {
                key: "saved_setting",
                label: "Stored value",
                source: "database",
                state: "configured",
                value: "configured value",
              },
              {
                key: "secret",
                label: "Secret",
                source: "runtime",
                state: "configured",
                value: "configured",
                secret: true,
              },
              {
                key: "optional",
                label: "Optional",
                source: "unset",
                state: "disabled",
                value: "manual only",
              },
            ],
            guardrails: [
              {
                label: "Delay guardrail",
                state: "warning",
                detail: "needs review",
              },
              {
                label: "Safety guardrail",
                state: "blocked",
                detail: "blocked detail",
              },
            ],
          },
          {
            id: "mail",
            label: "Mail ingest",
            state: "disabled",
            detail: "optional",
            action: "Configure a runnable mailbox source in Settings.",
            missing: [],
            settings: [],
            guardrails: [],
          },
        ],
      },
      liveSummary: {
        queued: 1,
        running: 2,
        succeeded: 3,
        failed: 4,
        blocked: 5,
        manualRequired: 6,
        latestObservedAt: "2026-06-17T03:00:00.000Z",
        latestDisplayStock: "In stock",
      },
    });

    expect(pageText()).not.toContain("Configuration is usable");
    expect(pageText()).not.toContain("Review guardrail");
    expect(pageText()).not.toContain("Blocked guardrail");
    expect(pageText()).not.toContain("Delay guardrailneeds reviewReview");
    expect(pageText()).not.toContain("Safety guardrailblocked detailBlocked");
    expect(pageText()).toContain("Delay guardrail");
    expect(pageText()).toContain("Check: needs review");
    expect(pageText()).toContain("Safety guardrail");
    expect(pageText()).toContain("Cannot proceed: blocked detail");
    expect(pageText()).toContain("Configure a runnable mailbox source in Settings.");
    expect(pageText()).toContain("last observed");

    renderDashboard({
      ...dashboardFixture,
      setupStatus: {
        ready: true,
        steps: [
          {
            id: "auth",
            label: "Admin auth",
            state: "complete",
            detail: "auth detail",
            action: null,
            missing: [],
            settings: [],
            guardrails: [],
          },
        ],
      },
    });
    expect(pageText()).toContain("auth detail");
  });

  it("renders worker status variants and dispatches control actions", () => {
    const onWorkerAction = vi.fn();

    renderDashboard({
      ...dashboardFixture,
      setupStatus: readySetupStatus(),
      workerStatus: {
        state: "running",
        pid: 123,
        startedAt: "2026-06-17T01:00:00.000Z",
        stoppedAt: null,
        exitCode: null,
        signal: null,
        lastError: null,
      },
      onWorkerAction,
    });

    expect(pageText()).toContain("pid 123 since");
    expect(pageText()).not.toContain("[stdout] five");
    expect(pageText()).not.toContain("scripts/juno-live-worker.ts");
    clickButton("Stop");
    clickButton("Restart");
    expect(onWorkerAction).toHaveBeenCalledWith("stop");
    expect(onWorkerAction).toHaveBeenCalledWith("restart");

    renderDashboard({
      ...dashboardFixture,
      setupStatus: readySetupStatus(),
      workerStatus: {
        state: "stopped",
        pid: null,
        startedAt: null,
        stoppedAt: "2026-06-17T02:00:00.000Z",
        exitCode: 0,
        signal: null,
        lastError: null,
      },
      onWorkerAction,
    });
    expect(pageText()).toContain("last stopped");
    clickButton("Start");
    expect(onWorkerAction).toHaveBeenCalledWith("start");

    renderDashboard({
      ...dashboardFixture,
      setupStatus: readySetupStatus(),
      workerStatus: {
        state: "exited",
        pid: null,
        startedAt: null,
        stoppedAt: "2026-06-17T02:00:00.000Z",
        exitCode: 1,
        signal: null,
        lastError: "worker crashed",
      },
    });
    expect(pageText()).toContain("worker crashed");

    renderDashboard({
      ...dashboardFixture,
      setupStatus: readySetupStatus(),
      workerStatus: {
        state: "running",
        pid: null,
        startedAt: null,
        stoppedAt: null,
        exitCode: null,
        signal: null,
        lastError: null,
      },
    });
    expect(pageText()).toContain("pid N/A since N/A");
  });

  it("shows API issues and disables live worker start until settings are complete", () => {
    const onWorkerAction = vi.fn();
    renderDashboard({
      ...dashboardFixture,
      setupStatus: {
        ready: false,
        steps: [
          {
            id: "database",
            label: "Database",
            state: "complete",
            detail: "database",
            action: null,
            missing: [],
            settings: [],
            guardrails: [],
          },
          {
            id: "juno",
            label: "Live stock lookup",
            state: "missing",
            detail: "juno",
            action: null,
            missing: ["juno_login_password"],
            settings: [],
            guardrails: [],
          },
        ],
      },
      apiIssues: [
        {
          status: "forbidden",
          message: "admin required",
          httpStatus: 403,
          endpoint: "/api/settings/status",
          label: "Setup status",
        },
        {
          status: "server_error",
          message: "worker route failed",
          httpStatus: 500,
          endpoint: "/api/live-lookups/worker",
          label: "Worker status",
        },
        {
          status: "unavailable",
          message: "digest unavailable",
          endpoint: "/api/insights/digest",
          label: "Operator digest",
        },
      ],
      workerStatus: {
        state: "stopped",
        pid: null,
        startedAt: null,
        stoppedAt: null,
        exitCode: null,
        signal: null,
        lastError: null,
      },
      onWorkerAction,
    });

    expect(pageText()).toContain("Dashboard data unavailable");
    expect(pageText()).not.toContain("API status issue");
    expect(pageText()).toContain("Access required (403) · /api/settings/status");
    expect(pageText()).toContain("Server error (500) · /api/live-lookups/worker");
    expect(pageText()).toContain("Route unavailable · /api/insights/digest");
    expect(pageText()).toContain("admin required");
    expect(pageText()).toContain("worker route failed");
    expect(pageText()).toContain("digest unavailable");
    expect(pageText()).toContain("Cannot start yet");
    expect(pageText()).toContain("Juno read-only login credentials");
    clickButton("Start");
    expect(onWorkerAction).not.toHaveBeenCalled();

    renderDashboard({
      ...dashboardFixture,
      setupStatus: {
        ready: false,
        steps: [
          {
            id: "database",
            label: "Database",
            state: "complete",
            detail: "database",
            action: null,
            missing: [],
            settings: [],
            guardrails: [],
          },
          {
            id: "juno",
            label: "Live stock lookup",
            state: "missing",
            detail: "juno",
            action: null,
            missing: [],
            settings: [
              {
                key: "juno_login_password",
                label: "Login password",
                source: "unset",
                state: "missing",
                value: "not set",
                secret: true,
              },
            ],
            guardrails: [],
          },
        ],
      },
      workerStatus: {
        state: "stopped",
        pid: null,
        startedAt: null,
        stoppedAt: null,
        exitCode: null,
        signal: null,
        lastError: null,
      },
      onWorkerAction,
    });
    expect(pageText()).toContain("Set Juno read-only login credentials.");

    renderDashboard({
      ...dashboardFixture,
      setupStatus: {
        ready: false,
        steps: [
          {
            id: "database",
            label: "Database",
            state: "complete",
            detail: "database",
            action: null,
            missing: [],
            settings: [],
            guardrails: [],
          },
          {
            id: "juno",
            label: "Live stock lookup",
            state: "complete",
            detail: "juno",
            action: null,
            missing: [],
            settings: [],
            guardrails: [
              {
                label: "Delay bounds",
                state: "blocked",
                detail: "Delay min must be less than or equal to delay max.",
              },
            ],
          },
        ],
      },
      workerStatus: {
        state: "stopped",
        pid: null,
        startedAt: null,
        stoppedAt: null,
        exitCode: null,
        signal: null,
        lastError: null,
      },
      onWorkerAction,
    });

    expect(pageText()).toContain("Delay min must be less than or equal to delay max.");
  });

  it("filters signals and dispatches saved view actions", () => {
    const onCreateDashboardSavedView = vi.fn();
    const onUpdateDashboardSavedView = vi.fn();
    const onDeleteDashboardSavedView = vi.fn();

    renderDashboard({
      ...dashboardFixture,
      onCreateDashboardSavedView,
      onUpdateDashboardSavedView,
      onDeleteDashboardSavedView,
    });

    expect(pageText()).toContain("Watch hit: Lara Voss - Signal Path");
    expect(pageText()).toContain("Low catalog stock: Lara Voss - Signal Path");
    expect(pageText()).toContain("[Operator digest] 2026-06-17");
    selectComboboxOption("Signal type", "Watch hit");
    expect(pageText()).toContain("Watch hit: Lara Voss - Signal Path");
    expect(pageText()).not.toContain("Low catalog stock: Lara Voss - Signal Path");
    expect(pageText()).not.toContain("[Operator digest] 2026-06-17");
    clickButton("Reset");
    selectComboboxOption("Severity", "Warning");
    expect(pageText()).not.toContain("Watch hit: Lara Voss - Signal Path");
    expect(pageText()).toContain("Low catalog stock: Lara Voss - Signal Path");
    expect(pageText()).toContain("No read-only alerts match filters");
    clickButton("Reset");
    clickByAriaLabel("Watch hits");
    expect(pageText()).toContain("Watch hit: Lara Voss - Signal Path");
    expect(pageText()).not.toContain("Low catalog stock: Lara Voss - Signal Path");
    clickButton("Reset");
    clickByAriaLabel("Low stock");
    expect(pageText()).toContain("Low catalog stock: Lara Voss - Signal Path");
    clickButton("Reset");
    clickByAriaLabel("Movement");
    expect(pageText()).not.toContain("Watch hit: Lara Voss - Signal Path");
    expect(pageText()).toContain("Observed stock change: Lara Voss - Signal Path");

    setInputValue('input[placeholder="Ops review"]', "Movement review");
    clickButton("Save");
    expect(onCreateDashboardSavedView).toHaveBeenCalledWith({
      name: "Movement review",
      filters: expect.objectContaining({ movementOnly: true }),
    });

    setSelectValue('select[aria-label="Signal date range"]', "7d");
    selectComboboxOption("Saved view", "Watch hits");
    expect(pageText()).toContain("Watch hit: Lara Voss - Signal Path");
    clickButton("Update");
    expect(onUpdateDashboardSavedView).toHaveBeenCalledWith(
      expect.objectContaining({ id: "dashboard-view-1" }),
      expect.objectContaining({ watchHitsOnly: true }),
    );
    clickByAriaLabel("Delete saved view");
    expect(onDeleteDashboardSavedView).toHaveBeenCalledWith(expect.objectContaining({ id: "dashboard-view-1" }));
    clickByAriaLabel("Clear saved view");
  });

  it("lets operators hide optional panels while pinned panels stay visible", async () => {
    renderDashboard(dashboardFixture);

    expect(pageText()).toContain("Today Signals");
    expect(pageText()).toContain("Signal Filters");

    clickButton("Panels");
    await act(async () => undefined);
    clickByAriaLabel("Today signals");

    expect(pageText()).not.toContain("Today Signals");
    expect(pageText()).toContain("Panels (1 hidden)");
    expect(pageText()).toContain("Signal Filters");
    expect(window.localStorage?.getItem(dashboardPanelLayoutStorageKey)).toContain("todaySignals");

    clickByAriaLabel("Today signals");
    expect(pageText()).toContain("Today Signals");
    clickByAriaLabel("Today signals");
    expect(pageText()).not.toContain("Today Signals");
    clickButton("Show all");
    expect(pageText()).toContain("Today Signals");
  });

  it("restores hidden optional panels from local preferences", async () => {
    window.localStorage?.setItem(
      dashboardPanelLayoutStorageKey,
      JSON.stringify({
        schemaVersion: 1,
        hiddenPanelIds: optionalDashboardPanelDefinitions.map((definition) => definition.id),
      }),
    );

    renderDashboard(dashboardFixture);
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(pageText()).toContain("Signal Filters");
    expect(pageText()).not.toContain("Ingestion Pipeline");
    expect(pageText()).not.toContain("Today Signals");
    expect(pageText()).not.toContain("worker status unavailable");
  });

  it("keeps panel visibility changes in memory when preference storage fails", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    renderDashboard(dashboardFixture);
    clickButton("Panels");
    await clickByAriaLabelAsync("Today signals");
    expect(pageText()).not.toContain("Today Signals");
  });

  it("keeps the dashboard usable when panel preference storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    renderDashboard(dashboardFixture);
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(pageText()).toContain("Today Signals");
    expect(pageText()).toContain("Signal Filters");
  });
});

class TestStorage implements Storage {
  #store = new Map<string, string>();

  get length() {
    return this.#store.size;
  }

  clear() {
    this.#store.clear();
  }

  getItem(key: string) {
    return this.#store.get(key) ?? null;
  }

  key(index: number) {
    return [...this.#store.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.#store.delete(key);
  }

  setItem(key: string, value: string) {
    this.#store.set(key, value);
  }
}

function installTestLocalStorage() {
  Object.defineProperty(globalThis, "Storage", {
    configurable: true,
    value: TestStorage,
  });
  Object.defineProperty(window, "Storage", {
    configurable: true,
    value: TestStorage,
  });
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: new TestStorage(),
  });
}

function renderDashboard(props: CatalogOpsDashboardProps): void {
  act(() => {
    root.render(
      <MantineProvider defaultColorScheme="light" theme={theme}>
        <CatalogOpsDashboard {...props} />
      </MantineProvider>,
    );
  });
}

function emptyIngestState(): NonNullable<CatalogOpsDashboardProps["ingestState"]> {
  return {
    mailboxSourceId: null,
    mailboxAddress: null,
    provider: null,
    lastQuery: null,
    lastQueryWindowFrom: null,
    lastQueryWindowTo: null,
    lastQueryStartedAt: null,
    lastQueryFinishedAt: null,
    lastQueryStatus: null,
    lastQueryError: null,
    lastQueryMessageCount: 0,
    lastQueryAttachmentCount: 0,
    lastSuccessfulMessageReceivedAt: null,
    lastIngestedSnapshotId: null,
    lastIngestedCatalogDate: null,
    lastIngestedContentHash: null,
  };
}

function readySetupStatus(): NonNullable<CatalogOpsDashboardProps["setupStatus"]> {
  return {
    ready: true,
    steps: [
      {
        id: "database",
        label: "Database",
        state: "complete",
        detail: "database ready",
        action: null,
        missing: [],
        settings: [],
        guardrails: [],
      },
      {
        id: "juno",
        label: "Live stock lookup",
        state: "complete",
        detail: "juno ready",
        action: null,
        missing: [],
        settings: [],
        guardrails: [
          {
            label: "Read-only browser lookup",
            state: "ok",
            detail: "Worker can reuse a persistent browser session and only open read-only product pages.",
          },
        ],
      },
    ],
  };
}

function pageText(): string {
  return document.body.textContent ?? "";
}

function clickButton(name: string): void {
  const button = Array.from(document.querySelectorAll("button")).find((entry) => entry.textContent === name);
  if (!button) {
    throw new Error(`Missing button ${name}`);
  }
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function clickByAriaLabel(label: string): void {
  const element = document.querySelector(`[aria-label="${label}"]`);
  if (!element) {
    throw new Error(`Missing control ${label}`);
  }
  act(() => {
    if (element instanceof HTMLInputElement && element.type === "checkbox") {
      element.click();
      return;
    }
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function clickByAriaLabelAsync(label: string): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const element = document.querySelector(`[aria-label="${label}"]`);
    if (element) {
      act(() => {
        if (element instanceof HTMLInputElement && element.type === "checkbox") {
          element.click();
          return;
        }
        element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      return;
    }
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
  }
  throw new Error(`Missing control ${label}`);
}

function selectComboboxOption(label: string, option: string): void {
  const input = Array.from(document.querySelectorAll("input")).find((entry) => entry.getAttribute("aria-label") === label);
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Missing combobox ${label}`);
  }
  act(() => {
    input.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  const optionElement = Array.from(document.querySelectorAll('[role="option"]')).find((entry) => entry.textContent === option);
  if (!optionElement) {
    throw new Error(`Missing option ${option}`);
  }
  act(() => {
    optionElement.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function setInputValue(selector: string, value: string): void {
  const input = document.querySelector(selector);
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Missing input ${selector}`);
  }
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function setSelectValue(selector: string, value: string): void {
  const select = document.querySelector(selector);
  if (!(select instanceof HTMLSelectElement)) {
    throw new Error(`Missing select ${selector}`);
  }
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    setter?.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function setReactActEnvironment(): void {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
}
