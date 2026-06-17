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
    workerActionPending: boolean;
    onWorkerAction: (action: "start" | "stop" | "restart") => void;
  }) => (
    <div>
      <output data-testid="dashboard-props">{JSON.stringify(props)}</output>
      <button type="button" onClick={() => props.onWorkerAction("start")}>
        start
      </button>
      <button type="button" onClick={() => props.onWorkerAction("stop")}>
        stop
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
      .mockResolvedValueOnce(jsonResponse({ state: { lastQueryStatus: "succeeded" } }))
      .mockResolvedValueOnce(jsonResponse({ summary: { queued: 2 } }))
      .mockResolvedValueOnce(jsonResponse({ worker: { state: "running" } }))
      .mockResolvedValueOnce(jsonResponse({ setup: { ready: true, steps: [] } }))
      .mockResolvedValueOnce(jsonResponse({ worker: { state: "running", pid: 123 } }))
      .mockResolvedValueOnce(new Response("nope", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      root.render(<Home />);
    });
    await act(async () => undefined);

    expect(readProps()).toContain('"lastQueryStatus":null');
    expect(readProps()).toContain('"queued":1');

    await act(async () => {
      vi.advanceTimersByTime(30000);
    });
    await act(async () => undefined);

    expect(readProps()).toContain('"lastQueryStatus":"succeeded"');
    expect(readProps()).toContain('"queued":2');

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
  });

  it("keeps state nullable when fetches fail or return non-OK responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockRejectedValueOnce(new Error("network down"))
        .mockResolvedValueOnce(new Response("nope", { status: 503 }))
        .mockResolvedValueOnce(new Response("nope", { status: 503 }))
        .mockResolvedValueOnce(new Response("nope", { status: 503 })),
    );

    await act(async () => {
      root.render(<Home />);
    });
    await act(async () => undefined);

    expect(readProps()).toContain('"ingestState":null');
    expect(readProps()).toContain('"liveSummary":null');
    expect(readProps()).toContain('"workerStatus":null');
    expect(readProps()).toContain('"setupStatus":null');
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
