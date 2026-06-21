/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home, { fetchDashboardJson } from "./dashboard-client";

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
    dashboardSavedViews: Array<{ id: string; name: string; filters: unknown }> | null;
    watchRules: Array<{ id: string; enabled: boolean }> | null;
    notificationDeliveries: unknown;
    notificationRules: unknown;
    notificationChannels: unknown;
    apiIssues: unknown;
    workerActionPending: boolean;
    watchRuleActionPending: boolean;
    dashboardSavedViewActionPending: boolean;
    onWorkerAction: (action: "start" | "stop" | "restart") => void;
    onCreateWatchRule: (draft: { type: "artist"; pattern: string }) => void;
    onToggleWatchRule: (rule: { id: string; enabled: boolean }) => void;
    onDeleteWatchRule: (rule: { id: string; enabled: boolean }) => void;
    onCreateDashboardSavedView: (draft: { name: string; filters: unknown }) => void;
    onUpdateDashboardSavedView: (view: { id: string; name: string; filters: unknown }, filters: unknown) => void;
    onDeleteDashboardSavedView: (view: { id: string; name: string; filters: unknown }) => void;
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
      <button
        type="button"
        onClick={() => props.onCreateDashboardSavedView({ name: "Watch hits", filters: { watchHitsOnly: true } })}
      >
        create-view
      </button>
      <button
        type="button"
        onClick={() =>
          props.onUpdateDashboardSavedView(
            props.dashboardSavedViews?.[0] ?? { id: "fallback-view", name: "Fallback", filters: {} },
            { lowStockOnly: true },
          )
        }
      >
        update-view
      </button>
      <button
        type="button"
        onClick={() =>
          props.onDeleteDashboardSavedView(
            props.dashboardSavedViews?.[0] ?? { id: "fallback-view", name: "Fallback", filters: {} },
          )
        }
      >
        delete-view
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
      .mockResolvedValueOnce(jsonResponse({ views: [{ id: "view-1", name: "Watch hits", filters: { watchHitsOnly: true } }] }))
      .mockResolvedValueOnce(jsonResponse({ rules: [{ id: "rule-1", enabled: true }] }))
      .mockResolvedValueOnce(jsonResponse({ deliveries: [{ id: "delivery-1", status: "queued" }] }))
      .mockResolvedValueOnce(jsonResponse({ rules: [{ id: "notification-rule-1", enabled: true }] }))
      .mockResolvedValueOnce(jsonResponse({ channels: [{ id: "channel-1", type: "in_app" }] }))
      .mockResolvedValueOnce(jsonResponse({ state: { lastQueryStatus: "succeeded" } }))
      .mockResolvedValueOnce(jsonResponse({ summary: { queued: 2 } }))
      .mockResolvedValueOnce(jsonResponse({ worker: { state: "running" } }))
      .mockResolvedValueOnce(jsonResponse({ setup: { ready: true, steps: [] } }))
      .mockResolvedValueOnce(jsonResponse({ signals: [{ signalId: "signal-2" }] }))
      .mockResolvedValueOnce(jsonResponse({ signals: [{ signalId: "movement-2" }] }))
      .mockResolvedValueOnce(jsonResponse({ trends: { genres: [{ key: "jazz" }] } }))
      .mockResolvedValueOnce(jsonResponse({ digest: { generatedAt: "2026-06-17T00:30:00.000Z" } }))
      .mockResolvedValueOnce(jsonResponse({ views: [{ id: "view-2", name: "Warnings", filters: { lowStockOnly: true } }] }))
      .mockResolvedValueOnce(jsonResponse({ rules: [{ id: "rule-2", enabled: false }] }))
      .mockResolvedValueOnce(jsonResponse({ deliveries: [{ id: "delivery-2", status: "sent" }] }))
      .mockResolvedValueOnce(jsonResponse({ rules: [{ id: "notification-rule-2", enabled: true }] }))
      .mockResolvedValueOnce(jsonResponse({ channels: [{ id: "channel-2", type: "webhook" }] }))
      .mockResolvedValueOnce(jsonResponse({ worker: { state: "running", pid: 123 } }))
      .mockResolvedValueOnce(new Response("nope", { status: 500 }))
      .mockResolvedValueOnce(jsonResponse({ rule: { id: "rule-3", enabled: true } }))
      .mockResolvedValueOnce(jsonResponse({ rule: { id: "rule-2", enabled: true } }))
      .mockResolvedValueOnce(jsonResponse({ deleted: true }))
      .mockResolvedValueOnce(jsonResponse({ view: { id: "view-3", name: "Watch hits", filters: { watchHitsOnly: true }, sortOrder: 0 } }))
      .mockResolvedValueOnce(jsonResponse({ view: { id: "view-2", name: "Warnings", filters: { lowStockOnly: true }, sortOrder: 0 } }))
      .mockResolvedValueOnce(jsonResponse({ deleted: true }))
      .mockResolvedValueOnce(new Response("nope", { status: 500 }))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(new Response("nope", { status: 500 }))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(new Response("nope", { status: 500 }))
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
    expect(readProps()).toContain('"id":"view-1"');
    expect(readProps()).toContain('"id":"rule-1"');
    expect(readProps()).toContain('"id":"delivery-1"');
    expect(readProps()).toContain('"id":"notification-rule-1"');
    expect(readProps()).toContain('"id":"channel-1"');

    await act(async () => {
      vi.advanceTimersByTime(30000);
    });
    await act(async () => undefined);

    expect(readProps()).toContain('"lastQueryStatus":"succeeded"');
    expect(readProps()).toContain('"queued":2');
    expect(readProps()).toContain('"signalId":"signal-2"');
    expect(readProps()).toContain('"signalId":"movement-2"');
    expect(readProps()).toContain('"key":"jazz"');
    expect(readProps()).toContain('"id":"view-2"');
    expect(readProps()).toContain('"id":"rule-2"');
    expect(readProps()).toContain('"id":"delivery-2"');
    expect(readProps()).toContain('"id":"notification-rule-2"');
    expect(readProps()).toContain('"id":"channel-2"');

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

    expect(readProps()).toContain('"pid":123');
    expect(readProps()).toContain('"label":"Live worker stop"');
    expect(readProps()).toContain('"status":"server_error"');

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
      clickButton("create-view");
    });
    await act(async () => undefined);

    expect(fetchMock).toHaveBeenCalledWith("/api/dashboard/saved-views", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Watch hits", filters: { watchHitsOnly: true } }),
    });
    expect(readProps()).toContain('"id":"view-3"');

    await act(async () => {
      clickButton("update-view");
    });
    await act(async () => undefined);

    expect(fetchMock).toHaveBeenCalledWith("/api/dashboard/saved-views", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "view-2", name: "Warnings", filters: { lowStockOnly: true } }),
    });

    await act(async () => {
      clickButton("delete-view");
    });
    await act(async () => undefined);

    expect(fetchMock).toHaveBeenCalledWith("/api/dashboard/saved-views", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "view-2" }),
    });

    await act(async () => {
      clickButton("create-view");
    });
    await act(async () => undefined);
    await act(async () => {
      clickButton("create-view");
    });
    await act(async () => undefined);
    await act(async () => {
      clickButton("update-view");
    });
    await act(async () => undefined);
    await act(async () => {
      clickButton("update-view");
    });
    await act(async () => undefined);
    await act(async () => {
      clickButton("delete-view");
    });
    await act(async () => undefined);

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
    expect(readProps()).toContain('"dashboardSavedViews":null');
    expect(readProps()).toContain('"watchRules":null');
    expect(readProps()).toContain('"notificationDeliveries":null');
    expect(readProps()).toContain('"notificationRules":null');
    expect(readProps()).toContain('"notificationChannels":null');
    expect(readProps()).toContain('"status":"unavailable"');
    expect(readProps()).toContain('"status":"server_error"');

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

  it("clears stale action issues after the matching endpoint recovers", async () => {
    const fetchMock = vi.fn();
    queueDashboardPoll(fetchMock, { state: "stopped" });
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "stop failed" }), { status: 500 }));
    queueDashboardPoll(fetchMock, { state: "running" });
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      root.render(<Home />);
    });
    await act(async () => undefined);

    await act(async () => {
      clickButton("stop");
    });
    await act(async () => undefined);
    expect(readProps()).toContain('"label":"Live worker stop"');

    await act(async () => {
      vi.advanceTimersByTime(30000);
    });
    await act(async () => undefined);

    expect(readProps()).not.toContain('"label":"Live worker stop"');
    expect(readProps()).toContain('"workerStatus":{"state":"running"');
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

  it("handles saved view actions while the current saved view list is still nullable", async () => {
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
        .mockResolvedValueOnce(new Response("nope", { status: 503 }))
        .mockResolvedValueOnce(new Response("nope", { status: 503 }))
        .mockResolvedValueOnce(new Response("nope", { status: 503 }))
        .mockResolvedValueOnce(new Response("nope", { status: 503 }))
        .mockResolvedValueOnce(jsonResponse({ view: { id: "created-view-from-null", name: "Watch hits", filters: {}, sortOrder: 0 } }))
        .mockResolvedValueOnce(jsonResponse({ view: { id: "created-view-from-null", name: "Watch hits", filters: {}, sortOrder: 0 } }))
        .mockResolvedValueOnce(jsonResponse({ deleted: true })),
    );

    await act(async () => {
      root.render(<Home />);
    });
    await act(async () => undefined);
    await act(async () => {
      clickButton("create-view");
    });
    await act(async () => undefined);

    expect(readProps()).toContain('"id":"created-view-from-null"');

    await act(async () => {
      clickButton("update-view");
    });
    await act(async () => undefined);
    await act(async () => {
      clickButton("delete-view");
    });
    await act(async () => undefined);

    expect(readProps()).toContain('"dashboardSavedViews":[]');
  });

  it("keeps saved view update and delete no-op safe while saved views are nullable", async () => {
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
        .mockResolvedValueOnce(new Response("nope", { status: 503 }))
        .mockResolvedValueOnce(new Response("nope", { status: 503 }))
        .mockResolvedValueOnce(new Response("nope", { status: 503 }))
        .mockResolvedValueOnce(new Response("nope", { status: 503 }))
        .mockResolvedValueOnce(jsonResponse({ deleted: true }))
        .mockResolvedValueOnce(jsonResponse({ view: { id: "fallback-view", name: "Fallback", filters: {}, sortOrder: 0 } })),
    );

    await act(async () => {
      root.render(<Home />);
    });
    await act(async () => undefined);
    await act(async () => {
      clickButton("delete-view");
    });
    await act(async () => undefined);
    await act(async () => {
      clickButton("update-view");
    });
    await act(async () => undefined);

    expect(readProps()).toContain('"dashboardSavedViews":[]');
  });

  it("keeps saved view update no-op safe before saved views have loaded", async () => {
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
        .mockResolvedValueOnce(new Response("nope", { status: 503 }))
        .mockResolvedValueOnce(new Response("nope", { status: 503 }))
        .mockResolvedValueOnce(new Response("nope", { status: 503 }))
        .mockResolvedValueOnce(new Response("nope", { status: 503 }))
        .mockResolvedValueOnce(jsonResponse({ view: { id: "fallback-view", name: "Fallback", filters: {}, sortOrder: 0 } })),
    );

    await act(async () => {
      root.render(<Home />);
    });
    await act(async () => undefined);
    await act(async () => {
      clickButton("update-view");
    });
    await act(async () => undefined);

    expect(readProps()).toContain('"dashboardSavedViews":[]');
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

  it("preserves dashboard fetch status codes", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "login required" }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "admin required" }), { status: 403 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "server down" }), { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "not found" }), { status: 404 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockRejectedValueOnce("offline");
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchDashboardJson("/api/a", "A")).resolves.toMatchObject({ status: "unauthorized", httpStatus: 401 });
    await expect(fetchDashboardJson("/api/b", "B")).resolves.toMatchObject({ status: "forbidden", httpStatus: 403 });
    await expect(fetchDashboardJson("/api/c", "C")).resolves.toMatchObject({ status: "server_error", httpStatus: 500 });
    await expect(fetchDashboardJson("/api/d", "D")).resolves.toMatchObject({ status: "unavailable", httpStatus: 404 });
    await expect(fetchDashboardJson("/api/e", "E")).resolves.toMatchObject({ status: "ok", data: { ok: true } });
    await expect(fetchDashboardJson("/api/f", "F")).resolves.toMatchObject({ status: "unavailable", error: "network error" });
  });
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function queueDashboardPoll(fetchMock: ReturnType<typeof vi.fn>, worker: unknown): void {
  fetchMock
    .mockResolvedValueOnce(jsonResponse({ state: { lastQueryStatus: null } }))
    .mockResolvedValueOnce(jsonResponse({ summary: { queued: 0 } }))
    .mockResolvedValueOnce(jsonResponse({ worker }))
    .mockResolvedValueOnce(jsonResponse({ setup: { ready: false, steps: [] } }))
    .mockResolvedValueOnce(jsonResponse({ signals: [] }))
    .mockResolvedValueOnce(jsonResponse({ signals: [] }))
    .mockResolvedValueOnce(jsonResponse({ trends: { genres: [], labels: [], watchOverlap: [] } }))
    .mockResolvedValueOnce(jsonResponse({ digest: { generatedAt: "2026-06-17T00:00:00.000Z", counts: {} } }))
    .mockResolvedValueOnce(jsonResponse({ views: [] }))
    .mockResolvedValueOnce(jsonResponse({ rules: [] }))
    .mockResolvedValueOnce(jsonResponse({ deliveries: [] }))
    .mockResolvedValueOnce(jsonResponse({ rules: [] }))
    .mockResolvedValueOnce(jsonResponse({ channels: [] }));
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
