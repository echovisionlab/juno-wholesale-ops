/* @vitest-environment jsdom */

import { MantineProvider } from "@mantine/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { theme } from "@/theme";
import { CatalogOpsDashboard, type CatalogOpsDashboardProps } from "./CatalogOpsDashboard";
import { dashboardFixture } from "./dashboard.fixtures";

let root: Root;
let container: HTMLDivElement;

describe("CatalogOpsDashboard", () => {
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

  it("renders unavailable setup, ingest, live stock, and worker states", () => {
    renderDashboard({
      stats: dashboardFixture.stats,
      pipeline: dashboardFixture.pipeline,
      commands: dashboardFixture.commands,
    });

    expect(pageText()).toContain("Setup status unavailable");
    expect(pageText()).toContain("Gmail ingest status unavailable");
    expect(pageText()).toContain("Today signals unavailable");
    expect(pageText()).toContain("Watch rules unavailable");
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
      watchRules: [],
      onCreateWatchRule,
      onToggleWatchRule,
      onDeleteWatchRule,
    });

    expect(pageText()).toContain("No observed signals today");
    expect(pageText()).toContain("No watch rules configured");
    setInputValue('input[placeholder="Artist, label, genre, or keyword"]', "Impulse");
    clickButton("Add rule");
    expect(onCreateWatchRule).toHaveBeenCalledWith({ type: "artist", pattern: "Impulse", weight: null });
    setSelectValue("select", "exclude_keyword");
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
      watchRuleActionPending: true,
    });
    expect(pageText()).toContain("not reported");
    expect(pageText()).toContain("New arrival");
    expect(pageText()).toContain("Exclude match");
    expect(pageText()).toContain("Warehouse Find");
    expect(pageText()).toContain("Disabled");
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
    expect(pageText()).toContain("no recorded Gmail ingest run");
  });

  it("renders setup warning, database override, secret, and optional setting states", () => {
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
                key: "db_override",
                label: "DB override",
                source: "database",
                state: "configured",
                value: "from row",
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
                label: "Review guardrail",
                state: "warning",
                detail: "needs review",
              },
              {
                label: "Blocked guardrail",
                state: "blocked",
                detail: "blocked detail",
              },
            ],
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

    expect(pageText()).toContain("Runtime configuration is usable");
    expect(pageText()).toContain("Review");
    expect(pageText()).toContain("Blocked");
    expect(pageText()).toContain("DB override");
    expect(pageText()).toContain("Secret set");
    expect(pageText()).toContain("Optional");
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
      workerStatus: {
        state: "running",
        pid: 123,
        startedAt: "2026-06-17T01:00:00.000Z",
        stoppedAt: null,
        exitCode: null,
        signal: null,
        lastError: null,
        command: "tsx",
        args: ["scripts/juno-live-worker.ts", "--loop"],
        recentLogs: [
          { stream: "stdout", line: "one", occurredAt: "2026-06-17T01:00:00.000Z" },
          { stream: "stderr", line: "two", occurredAt: "2026-06-17T01:00:01.000Z" },
          { stream: "stdout", line: "three", occurredAt: "2026-06-17T01:00:02.000Z" },
          { stream: "stdout", line: "four", occurredAt: "2026-06-17T01:00:03.000Z" },
          { stream: "stdout", line: "five", occurredAt: "2026-06-17T01:00:04.000Z" },
        ],
      },
      onWorkerAction,
    });

    expect(pageText()).toContain("pid 123 since");
    expect(pageText()).toContain("[stdout] five");
    clickButton("Stop");
    clickButton("Restart");
    expect(onWorkerAction).toHaveBeenCalledWith("stop");
    expect(onWorkerAction).toHaveBeenCalledWith("restart");

    renderDashboard({
      ...dashboardFixture,
      workerStatus: {
        state: "stopped",
        pid: null,
        startedAt: null,
        stoppedAt: "2026-06-17T02:00:00.000Z",
        exitCode: 0,
        signal: null,
        lastError: null,
        command: "tsx",
        args: [],
        recentLogs: [],
      },
      onWorkerAction,
    });
    expect(pageText()).toContain("last stopped");
    clickButton("Start");
    expect(onWorkerAction).toHaveBeenCalledWith("start");

    renderDashboard({
      ...dashboardFixture,
      workerStatus: {
        state: "exited",
        pid: null,
        startedAt: null,
        stoppedAt: "2026-06-17T02:00:00.000Z",
        exitCode: 1,
        signal: null,
        lastError: "worker crashed",
        command: "tsx",
        args: [],
        recentLogs: [],
      },
    });
    expect(pageText()).toContain("worker crashed");

    renderDashboard({
      ...dashboardFixture,
      workerStatus: {
        state: "running",
        pid: null,
        startedAt: null,
        stoppedAt: null,
        exitCode: null,
        signal: null,
        lastError: null,
        command: "tsx",
        args: [],
        recentLogs: [],
      },
    });
    expect(pageText()).toContain("pid N/A since N/A");
  });
});

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
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
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
