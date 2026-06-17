/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./page";

vi.mock("@/components/dashboard/CatalogOpsDashboard", () => ({
  CatalogOpsDashboard: (props: {
    ingestState: unknown;
    liveSummary: unknown;
    workerStatus: unknown;
    setupStatus: unknown;
    todaySignals: unknown;
    movementSignals: unknown;
    catalogTrends: unknown;
    operatorDigest: unknown;
    watchRules: Array<{ id: string; enabled: boolean }> | null;
    workerActionPending: boolean;
    watchRuleActionPending: boolean;
    onWorkerAction: (action: "start" | "stop" | "restart") => void;
    onCreateWatchRule: (draft: { type: "artist"; pattern: string }) => void;
    onToggleWatchRule: (rule: { id: string; enabled: boolean }) => void;
    onDeleteWatchRule: (rule: { id: string; enabled: boolean }) => void;
  }) => (
    <div>
      <output data-testid="dashboard-props">{JSON.stringify(props)}</output>
      <button type="button" onClick={() => props.onWorkerAction("start")}>
        start
      </button>
      <button type="button" onClick={() => props.onWorkerAction("stop")}>
        stop
      </button>
      <button type="button" onClick={() => props.onCreateWatchRule({ type: "artist", pattern: "Lara Voss" })}>
        create-rule
      </button>
      <button
        type="button"
        onClick={() => props.onToggleWatchRule(props.watchRules?.[0] ?? { id: "fallback-rule", enabled: true })}
      >
        toggle-rule
      </button>
      <button
        type="button"
        onClick={() => props.onDeleteWatchRule(props.watchRules?.[0] ?? { id: "fallback-rule", enabled: true })}
      >
        delete-rule
      </button>
    </div>
  ),
}));

describe("Home dashboard polling", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    setReactActEnvironment();
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("polls dashboard endpoints and posts worker actions", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ state: { lastQueryStatus: null } }))
      .mockResolvedValueOnce(jsonResponse({ summary: { queued: 1 } }))
      .mockResolvedValueOnce(jsonResponse({ worker: { state: "stopped" } }))
      .mockResolvedValueOnce(jsonResponse({ setup: { ready: false, steps: [] } }))
      .mockResolvedValueOnce(jsonResponse({ signals: [{ signalId: "signal-1" }] }))
      .mockResolvedValueOnce(jsonResponse({ signals: [{ signalId: "movement-1" }] }))
      .mockResolvedValueOnce(jsonResponse({ trends: { genres: [] } }))
      .mockResolvedValueOnce(jsonResponse({ digest: { generatedAt: "2026-06-17T00:00:00.000Z" } }))
      .mockResolvedValueOnce(jsonResponse({ rules: [{ id: "rule-1", enabled: true }] }))
      .mockResolvedValueOnce(jsonResponse({ state: { lastQueryStatus: "succeeded" } }))
      .mockResolvedValueOnce(jsonResponse({ summary: { queued: 2 } }))
      .mockResolvedValueOnce(jsonResponse({ worker: { state: "running" } }))
      .mockResolvedValueOnce(jsonResponse({ setup: { ready: true, steps: [] } }))
      .mockResolvedValueOnce(jsonResponse({ signals: [{ signalId: "signal-2" }] }))
      .mockResolvedValueOnce(jsonResponse({ signals: [{ signalId: "movement-2" }] }))
      .mockResolvedValueOnce(jsonResponse({ trends: { genres: [{ key: "jazz" }] } }))
      .mockResolvedValueOnce(jsonResponse({ digest: { generatedAt: "2026-06-17T00:30:00.000Z" } }))
      .mockResolvedValueOnce(jsonResponse({ rules: [{ id: "rule-2", enabled: false }] }))
      .mockResolvedValueOnce(jsonResponse({ worker: { state: "running", pid: 123 } }))
      .mockResolvedValueOnce(new Response("nope", { status: 500 }))
      .mockResolvedValueOnce(jsonResponse({ rule: { id: "rule-3", enabled: true } }))
      .mockResolvedValueOnce(jsonResponse({ rule: { id: "rule-2", enabled: true } }))
      .mockResolvedValueOnce(jsonResponse({ deleted: true }))
      .mockResolvedValueOnce(new Response("nope", { status: 500 }))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(new Response("nope", { status: 500 }))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(new Response("nope", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      root.render(<Home />);
    });
    await act(async () => undefined);

    expect(readProps()).toContain('"lastQueryStatus":null');
    expect(readProps()).toContain('"queued":1');
    expect(readProps()).toContain('"signalId":"signal-1"');
    expect(readProps()).toContain('"signalId":"movement-1"');
    expect(readProps()).toContain('"generatedAt":"2026-06-17T00:00:00.000Z"');
    expect(readProps()).toContain('"id":"rule-1"');

    await act(async () => {
      vi.advanceTimersByTime(30000);
    });
    await act(async () => undefined);

    expect(readProps()).toContain('"lastQueryStatus":"succeeded"');
    expect(readProps()).toContain('"queued":2');
    expect(readProps()).toContain('"signalId":"signal-2"');
    expect(readProps()).toContain('"signalId":"movement-2"');
    expect(readProps()).toContain('"key":"jazz"');
    expect(readProps()).toContain('"id":"rule-2"');

    await act(async () => {
      clickButton("start");
    });
    await act(async () => undefined);

    expect(fetchMock).toHaveBeenCalledWith("/api/live-lookups/worker", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "start" }),
    });
    expect(readProps()).toContain('"pid":123');

    await act(async () => {
      clickButton("stop");
    });
    await act(async () => undefined);

    expect(readProps()).toContain('"workerStatus":null');

    await act(async () => {
      clickButton("create-rule");
    });
    await act(async () => undefined);

    expect(fetchMock).toHaveBeenCalledWith("/api/watch-rules", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "artist", pattern: "Lara Voss" }),
    });
    expect(readProps()).toContain('"id":"rule-3"');

    await act(async () => {
      clickButton("toggle-rule");
    });
    await act(async () => undefined);

    expect(fetchMock).toHaveBeenCalledWith("/api/watch-rules", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "rule-3", enabled: false }),
    });

    await act(async () => {
      clickButton("delete-rule");
    });
    await act(async () => undefined);

    expect(fetchMock).toHaveBeenCalledWith("/api/watch-rules", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "rule-3" }),
    });

    await act(async () => {
      clickButton("create-rule");
    });
    await act(async () => undefined);
    await act(async () => {
      clickButton("create-rule");
    });
    await act(async () => undefined);
    await act(async () => {
      clickButton("toggle-rule");
    });
    await act(async () => undefined);
    await act(async () => {
      clickButton("toggle-rule");
    });
    await act(async () => undefined);
    await act(async () => {
      clickButton("delete-rule");
    });
    await act(async () => undefined);
  });

  it("keeps state nullable when fetches fail or return non-OK responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockRejectedValueOnce(new Error("network down"))
        .mockResolvedValueOnce(new Response("nope", { status: 503 }))
        .mockResolvedValueOnce(new Response("nope", { status: 503 }))
        .mockResolvedValueOnce(new Response("nope", { status: 503 }))
        .mockResolvedValueOnce(new Response("nope", { status: 503 }))
        .mockResolvedValueOnce(new Response("nope", { status: 503 }))
        .mockResolvedValueOnce(new Response("nope", { status: 503 }))
        .mockResolvedValueOnce(new Response("nope", { status: 503 }))
        .mockResolvedValueOnce(new Response("nope", { status: 503 }))
        .mockResolvedValueOnce(jsonResponse({ rule: { id: "fallback-rule", enabled: false } }))
        .mockResolvedValueOnce(jsonResponse({ deleted: true }))
        .mockResolvedValueOnce(jsonResponse({ rule: { id: "rule-from-null", enabled: true } })),
    );

    await act(async () => {
      root.render(<Home />);
    });
    await act(async () => undefined);

    expect(readProps()).toContain('"ingestState":null');
    expect(readProps()).toContain('"liveSummary":null');
    expect(readProps()).toContain('"workerStatus":null');
    expect(readProps()).toContain('"setupStatus":null');
    expect(readProps()).toContain('"todaySignals":null');
    expect(readProps()).toContain('"movementSignals":null');
    expect(readProps()).toContain('"catalogTrends":null');
    expect(readProps()).toContain('"operatorDigest":null');
    expect(readProps()).toContain('"watchRules":null');

    await act(async () => {
      clickButton("toggle-rule");
    });
    await act(async () => undefined);
    await act(async () => {
      clickButton("delete-rule");
    });
    await act(async () => undefined);
    await act(async () => {
      clickButton("create-rule");
    });
    await act(async () => undefined);

    expect(readProps()).toContain('"id":"rule-from-null"');
  });

  it("adds a watch rule when the current watch rule list is still nullable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockRejectedValueOnce(new Error("network down"))
        .mockResolvedValueOnce(new Response("nope", { status: 503 }))
        .mockResolvedValueOnce(new Response("nope", { status: 503 }))
        .mockResolvedValueOnce(new Response("nope", { status: 503 }))
        .mockResolvedValueOnce(new Response("nope", { status: 503 }))
        .mockResolvedValueOnce(new Response("nope", { status: 503 }))
        .mockResolvedValueOnce(new Response("nope", { status: 503 }))
        .mockResolvedValueOnce(new Response("nope", { status: 503 }))
        .mockResolvedValueOnce(new Response("nope", { status: 503 }))
        .mockResolvedValueOnce(jsonResponse({ rule: { id: "created-from-null", enabled: true } })),
    );

    await act(async () => {
      root.render(<Home />);
    });
    await act(async () => undefined);
    await act(async () => {
      clickButton("create-rule");
    });
    await act(async () => undefined);

    expect(readProps()).toContain('"id":"created-from-null"');
  });

  it("handles watch rule deletion while the current watch rule list is still nullable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockRejectedValueOnce(new Error("network down"))
        .mockResolvedValueOnce(new Response("nope", { status: 503 }))
        .mockResolvedValueOnce(new Response("nope", { status: 503 }))
        .mockResolvedValueOnce(new Response("nope", { status: 503 }))
        .mockResolvedValueOnce(new Response("nope", { status: 503 }))
        .mockResolvedValueOnce(new Response("nope", { status: 503 }))
        .mockResolvedValueOnce(new Response("nope", { status: 503 }))
        .mockResolvedValueOnce(new Response("nope", { status: 503 }))
        .mockResolvedValueOnce(new Response("nope", { status: 503 }))
        .mockResolvedValueOnce(jsonResponse({ deleted: true })),
    );

    await act(async () => {
      root.render(<Home />);
    });
    await act(async () => undefined);
    await act(async () => {
      clickButton("delete-rule");
    });
    await act(async () => undefined);

    expect(readProps()).toContain('"watchRules":[]');
  });

  it("does not update state after unmounting while polling is in flight", async () => {
    const pending = createDeferred<Response>();
    vi.stubGlobal("fetch", vi.fn(() => pending.promise));

    await act(async () => {
      root.render(<Home />);
    });
    act(() => root.unmount());

    await act(async () => {
      pending.resolve(jsonResponse({ state: { lastQueryStatus: "succeeded" } }));
      await pending.promise;
    });

    expect(readProps()).toBe("");
  });
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function readProps(): string {
  return document.querySelector("[data-testid='dashboard-props']")?.textContent ?? "";
}

function clickButton(name: string): void {
  const button = Array.from(document.querySelectorAll("button")).find((entry) => entry.textContent === name);
  if (!button) {
    throw new Error(`Missing button ${name}`);
  }
  button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

function createDeferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

function setReactActEnvironment(): void {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
}
