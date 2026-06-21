"use client";

import { useEffect, useState } from "react";
import { CatalogOpsDashboard } from "@/components/dashboard/CatalogOpsDashboard";
import { dashboardFixture } from "@/components/dashboard/dashboard.fixtures";
import type {
  AppSetupStatus,
  CatalogTrendSummary,
  DashboardSavedView,
  DashboardSavedViewDraft,
  DashboardResourceIssue,
  GmailIngestState,
  InsightDigest,
  LiveLookupDashboardSummary,
  LiveWorkerAction,
  LiveWorkerStatus,
  MovementSignal,
  NotificationChannel,
  NotificationDelivery,
  NotificationRule,
  ResourceState,
  TodayInsight,
  WatchRule,
  WatchRuleDraft,
} from "@/components/dashboard/types";

export default function Home() {
  const [ingestState, setIngestState] = useState<GmailIngestState | null>(null);
  const [liveSummary, setLiveSummary] = useState<LiveLookupDashboardSummary | null>(null);
  const [workerStatus, setWorkerStatus] = useState<LiveWorkerStatus | null>(null);
  const [setupStatus, setSetupStatus] = useState<AppSetupStatus | null>(null);
  const [todaySignals, setTodaySignals] = useState<TodayInsight[] | null>(null);
  const [movementSignals, setMovementSignals] = useState<MovementSignal[] | null>(null);
  const [catalogTrends, setCatalogTrends] = useState<CatalogTrendSummary | null>(null);
  const [operatorDigest, setOperatorDigest] = useState<InsightDigest | null>(null);
  const [dashboardSavedViews, setDashboardSavedViews] = useState<DashboardSavedView[] | null>(null);
  const [watchRules, setWatchRules] = useState<WatchRule[] | null>(null);
  const [notificationDeliveries, setNotificationDeliveries] = useState<NotificationDelivery[] | null>(null);
  const [notificationRules, setNotificationRules] = useState<NotificationRule[] | null>(null);
  const [notificationChannels, setNotificationChannels] = useState<NotificationChannel[] | null>(null);
  const [apiIssues, setApiIssues] = useState<DashboardResourceIssue[]>([]);
  const [actionIssues, setActionIssues] = useState<DashboardResourceIssue[]>([]);
  const [workerActionPending, setWorkerActionPending] = useState(false);
  const [watchRuleActionPending, setWatchRuleActionPending] = useState(false);
  const [dashboardSavedViewActionPending, setDashboardSavedViewActionPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void refreshDashboardState(
      () => cancelled,
      setIngestState,
      setLiveSummary,
      setWorkerStatus,
      setSetupStatus,
      setTodaySignals,
      setMovementSignals,
      setCatalogTrends,
      setOperatorDigest,
      setDashboardSavedViews,
      setWatchRules,
      setNotificationDeliveries,
      setNotificationRules,
      setNotificationChannels,
      setApiIssues,
      setActionIssues,
    );
    const intervalId = window.setInterval(() => {
      void refreshDashboardState(
        () => cancelled,
        setIngestState,
        setLiveSummary,
        setWorkerStatus,
        setSetupStatus,
        setTodaySignals,
        setMovementSignals,
        setCatalogTrends,
        setOperatorDigest,
        setDashboardSavedViews,
        setWatchRules,
        setNotificationDeliveries,
        setNotificationRules,
        setNotificationChannels,
        setApiIssues,
        setActionIssues,
      );
    }, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  async function handleWorkerAction(action: LiveWorkerAction) {
    const actionLabel = `Live worker ${action}`;
    setWorkerActionPending(true);
    try {
      const payload = await fetchDashboardJson<{ worker?: LiveWorkerStatus }>("/api/live-lookups/worker", actionLabel, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (recordActionIssue(payload, setActionIssues)) {
        return;
      }
      const data = okData(payload);
      if (!data) {
        return;
      }
      clearActionIssuesForEndpoint("/api/live-lookups/worker", setActionIssues);
      setWorkerStatus(data.worker ?? null);
    } finally {
      setWorkerActionPending(false);
    }
  }

  async function handleCreateWatchRule(draft: WatchRuleDraft) {
    const actionLabel = "Watch rule create";
    setWatchRuleActionPending(true);
    try {
      const payload = await fetchDashboardJson<{ rule?: WatchRule }>("/api/watch-rules", actionLabel, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (recordActionIssue(payload, setActionIssues)) {
        return;
      }
      const data = okData(payload);
      if (!data) {
        return;
      }
      clearActionIssuesForEndpoint("/api/watch-rules", setActionIssues);
      const createdRule = data.rule;
      if (createdRule) {
        setWatchRules((rules) => [createdRule, ...(rules ?? [])]);
      }
    } finally {
      setWatchRuleActionPending(false);
    }
  }

  async function handleToggleWatchRule(rule: WatchRule) {
    const actionLabel = "Watch rule update";
    setWatchRuleActionPending(true);
    try {
      const payload = await fetchDashboardJson<{ rule?: WatchRule }>("/api/watch-rules", actionLabel, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: rule.id, enabled: !rule.enabled }),
      });
      if (recordActionIssue(payload, setActionIssues)) {
        return;
      }
      const data = okData(payload);
      if (!data) {
        return;
      }
      clearActionIssuesForEndpoint("/api/watch-rules", setActionIssues);
      const updatedRule = data.rule;
      if (updatedRule) {
        setWatchRules((rules) => (rules ?? []).map((entry) => (entry.id === updatedRule.id ? updatedRule : entry)));
      }
    } finally {
      setWatchRuleActionPending(false);
    }
  }

  async function handleDeleteWatchRule(rule: WatchRule) {
    const actionLabel = "Watch rule delete";
    setWatchRuleActionPending(true);
    try {
      const payload = await fetchDashboardJson<{ deleted?: boolean }>("/api/watch-rules", actionLabel, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: rule.id }),
      });
      if (recordActionIssue(payload, setActionIssues)) {
        return;
      }
      const data = okData(payload);
      if (!data) {
        return;
      }
      clearActionIssuesForEndpoint("/api/watch-rules", setActionIssues);
      if (data.deleted !== false) {
        setWatchRules((rules) => (rules ?? []).filter((entry) => entry.id !== rule.id));
      }
    } finally {
      setWatchRuleActionPending(false);
    }
  }

  async function handleCreateDashboardSavedView(draft: DashboardSavedViewDraft) {
    const actionLabel = "Dashboard saved view create";
    setDashboardSavedViewActionPending(true);
    try {
      const payload = await fetchDashboardJson<{ view?: DashboardSavedView }>("/api/dashboard/saved-views", actionLabel, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (recordActionIssue(payload, setActionIssues)) {
        return;
      }
      const data = okData(payload);
      if (!data) {
        return;
      }
      clearActionIssuesForEndpoint("/api/dashboard/saved-views", setActionIssues);
      const createdView = data.view;
      if (createdView) {
        setDashboardSavedViews((views) => [...(views ?? []), createdView].sort(sortDashboardSavedViews));
      }
    } finally {
      setDashboardSavedViewActionPending(false);
    }
  }

  async function handleUpdateDashboardSavedView(view: DashboardSavedView, filters: DashboardSavedView["filters"]) {
    const actionLabel = "Dashboard saved view update";
    setDashboardSavedViewActionPending(true);
    try {
      const payload = await fetchDashboardJson<{ view?: DashboardSavedView }>("/api/dashboard/saved-views", actionLabel, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: view.id, name: view.name, filters }),
      });
      if (recordActionIssue(payload, setActionIssues)) {
        return;
      }
      const data = okData(payload);
      if (!data) {
        return;
      }
      clearActionIssuesForEndpoint("/api/dashboard/saved-views", setActionIssues);
      const updatedView = data.view;
      if (updatedView) {
        setDashboardSavedViews((views) =>
          (views ?? []).map((entry) => (entry.id === updatedView.id ? updatedView : entry)).sort(sortDashboardSavedViews),
        );
      }
    } finally {
      setDashboardSavedViewActionPending(false);
    }
  }

  async function handleDeleteDashboardSavedView(view: DashboardSavedView) {
    const actionLabel = "Dashboard saved view delete";
    setDashboardSavedViewActionPending(true);
    try {
      const payload = await fetchDashboardJson<{ deleted?: boolean }>("/api/dashboard/saved-views", actionLabel, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: view.id }),
      });
      if (recordActionIssue(payload, setActionIssues)) {
        return;
      }
      const data = okData(payload);
      if (!data) {
        return;
      }
      clearActionIssuesForEndpoint("/api/dashboard/saved-views", setActionIssues);
      if (data.deleted !== false) {
        setDashboardSavedViews((views) => (views ?? []).filter((entry) => entry.id !== view.id));
      }
    } finally {
      setDashboardSavedViewActionPending(false);
    }
  }

  return (
    <CatalogOpsDashboard
      {...dashboardFixture}
      ingestState={ingestState}
      liveSummary={liveSummary}
      workerStatus={workerStatus}
      setupStatus={setupStatus}
      todaySignals={todaySignals}
      movementSignals={movementSignals}
      catalogTrends={catalogTrends}
      operatorDigest={operatorDigest}
      dashboardSavedViews={dashboardSavedViews}
      watchRules={watchRules}
      notificationDeliveries={notificationDeliveries}
      notificationRules={notificationRules}
      notificationChannels={notificationChannels}
      apiIssues={[...actionIssues, ...apiIssues]}
      workerActionPending={workerActionPending}
      watchRuleActionPending={watchRuleActionPending}
      dashboardSavedViewActionPending={dashboardSavedViewActionPending}
      onWorkerAction={handleWorkerAction}
      onCreateWatchRule={handleCreateWatchRule}
      onToggleWatchRule={handleToggleWatchRule}
      onDeleteWatchRule={handleDeleteWatchRule}
      onCreateDashboardSavedView={handleCreateDashboardSavedView}
      onUpdateDashboardSavedView={handleUpdateDashboardSavedView}
      onDeleteDashboardSavedView={handleDeleteDashboardSavedView}
    />
  );
}

const dashboardRefreshEndpoints = [
  "/api/ingest/status",
  "/api/live-lookups/status",
  "/api/live-lookups/worker",
  "/api/settings/status",
  "/api/insights/today?limit=100",
  "/api/insights/movement?limit=100",
  "/api/insights/trends?windowDays=7&previousWindowDays=7&limit=20",
  "/api/insights/digest",
  "/api/dashboard/saved-views",
  "/api/watch-rules",
  "/api/notifications/deliveries?limit=100",
  "/api/notifications/rules",
  "/api/notifications/channels",
] as const;

async function refreshDashboardState(
  isCancelled: () => boolean,
  setIngestState: (state: GmailIngestState | null) => void,
  setLiveSummary: (summary: LiveLookupDashboardSummary | null) => void,
  setWorkerStatus: (status: LiveWorkerStatus | null) => void,
  setSetupStatus: (status: AppSetupStatus | null) => void,
  setTodaySignals: (signals: TodayInsight[] | null) => void,
  setMovementSignals: (signals: MovementSignal[] | null) => void,
  setCatalogTrends: (trends: CatalogTrendSummary | null) => void,
  setOperatorDigest: (digest: InsightDigest | null) => void,
  setDashboardSavedViews: (views: DashboardSavedView[] | null) => void,
  setWatchRules: (rules: WatchRule[] | null) => void,
  setNotificationDeliveries: (deliveries: NotificationDelivery[] | null) => void,
  setNotificationRules: (rules: NotificationRule[] | null) => void,
  setNotificationChannels: (channels: NotificationChannel[] | null) => void,
  setApiIssues: (issues: DashboardResourceIssue[]) => void,
  setActionIssues: (updater: (issues: DashboardResourceIssue[]) => DashboardResourceIssue[]) => void,
) {
  const [
    ingestPayload,
    summaryPayload,
    workerPayload,
    setupPayload,
    signalsPayload,
    movementPayload,
    trendsPayload,
    digestPayload,
    dashboardSavedViewsPayload,
    watchRulesPayload,
    notificationDeliveriesPayload,
    notificationRulesPayload,
    notificationChannelsPayload,
  ] = await Promise.all([
    fetchDashboardJson<{ state?: GmailIngestState }>(dashboardRefreshEndpoints[0], "Mail ingest status"),
    fetchDashboardJson<{ summary?: LiveLookupDashboardSummary }>(dashboardRefreshEndpoints[1], "Live lookup summary"),
    fetchDashboardJson<{ worker?: LiveWorkerStatus }>(dashboardRefreshEndpoints[2], "Live worker"),
    fetchDashboardJson<{ setup?: AppSetupStatus }>(dashboardRefreshEndpoints[3], "Setup status"),
    fetchDashboardJson<{ signals?: TodayInsight[] }>(dashboardRefreshEndpoints[4], "Today signals"),
    fetchDashboardJson<{ signals?: MovementSignal[] }>(dashboardRefreshEndpoints[5], "Movement signals"),
    fetchDashboardJson<{ trends?: CatalogTrendSummary }>(dashboardRefreshEndpoints[6], "Catalog trends"),
    fetchDashboardJson<{ digest?: InsightDigest }>(dashboardRefreshEndpoints[7], "Operator digest"),
    fetchDashboardJson<{ views?: DashboardSavedView[] }>(dashboardRefreshEndpoints[8], "Dashboard saved views"),
    fetchDashboardJson<{ rules?: WatchRule[] }>(dashboardRefreshEndpoints[9], "Watch rules"),
    fetchDashboardJson<{ deliveries?: NotificationDelivery[] }>(dashboardRefreshEndpoints[10], "Notification deliveries"),
    fetchDashboardJson<{ rules?: NotificationRule[] }>(dashboardRefreshEndpoints[11], "Notification rules"),
    fetchDashboardJson<{ channels?: NotificationChannel[] }>(dashboardRefreshEndpoints[12], "Notification channels"),
  ]);

  if (!isCancelled()) {
    setIngestState(okData(ingestPayload)?.state ?? null);
    setLiveSummary(okData(summaryPayload)?.summary ?? null);
    setWorkerStatus(okData(workerPayload)?.worker ?? null);
    setSetupStatus(okData(setupPayload)?.setup ?? null);
    setTodaySignals(okData(signalsPayload)?.signals ?? null);
    setMovementSignals(okData(movementPayload)?.signals ?? null);
    setCatalogTrends(okData(trendsPayload)?.trends ?? null);
    setOperatorDigest(okData(digestPayload)?.digest ?? null);
    setDashboardSavedViews(okData(dashboardSavedViewsPayload)?.views ?? null);
    setWatchRules(okData(watchRulesPayload)?.rules ?? null);
    setNotificationDeliveries(okData(notificationDeliveriesPayload)?.deliveries ?? null);
    setNotificationRules(okData(notificationRulesPayload)?.rules ?? null);
    setNotificationChannels(okData(notificationChannelsPayload)?.channels ?? null);
    const resourceStates: ResourceState<unknown>[] = [
      ingestPayload,
      summaryPayload,
      workerPayload,
      setupPayload,
      signalsPayload,
      movementPayload,
      trendsPayload,
      digestPayload,
      dashboardSavedViewsPayload,
      watchRulesPayload,
      notificationDeliveriesPayload,
      notificationRulesPayload,
      notificationChannelsPayload,
    ];
    setApiIssues(resourceStates.filter(isResourceIssue));
    clearActionIssuesForEndpoints(okEndpoints(resourceStates), setActionIssues);
  }
}

export async function fetchDashboardJson<T>(url: string, label: string, init?: RequestInit): Promise<ResourceState<T>> {
  try {
    const response = init ? await fetch(url, init) : await fetch(url);
    const payload = (await response.json().catch(() => ({}))) as T & { error?: string; message?: string };
    if (response.ok) {
      return { status: "ok", data: payload };
    }
    const message = payload.error ?? payload.message ?? `${label} returned ${response.status}`;
    if (response.status === 401) {
      return { status: "unauthorized", message, httpStatus: 401, endpoint: url, label };
    }
    if (response.status === 403) {
      return { status: "forbidden", message, httpStatus: 403, endpoint: url, label };
    }
    if (response.status >= 500) {
      return { status: "server_error", message, httpStatus: response.status, endpoint: url, label, error: payload.error };
    }
    return { status: "unavailable", message, httpStatus: response.status, endpoint: url, label, error: payload.error };
  } catch (error: unknown) {
    return {
      status: "unavailable",
      message: `${label} could not be reached`,
      endpoint: url,
      label,
      error: error instanceof Error ? error.message : "network error",
    };
  }
}

function recordActionIssue(
  state: ResourceState<unknown>,
  setActionIssues: (updater: (issues: DashboardResourceIssue[]) => DashboardResourceIssue[]) => void,
): state is DashboardResourceIssue {
  if (!isResourceIssue(state)) {
    return false;
  }
  setActionIssues((issues) => [...issues.filter((issue) => issue.endpoint !== state.endpoint), state]);
  return true;
}

function clearActionIssuesForEndpoint(
  endpoint: string,
  setActionIssues: (updater: (issues: DashboardResourceIssue[]) => DashboardResourceIssue[]) => void,
): void {
  setActionIssues((issues) => issues.filter((issue) => issue.endpoint !== endpoint));
}

function clearActionIssuesForEndpoints(
  endpoints: string[],
  setActionIssues: (updater: (issues: DashboardResourceIssue[]) => DashboardResourceIssue[]) => void,
): void {
  if (endpoints.length === 0) {
    return;
  }
  const endpointSet = new Set(endpoints);
  setActionIssues((issues) => issues.filter((issue) => !endpointSet.has(issue.endpoint)));
}

function okEndpoints(states: ResourceState<unknown>[]): string[] {
  return states.flatMap((state, index) => {
    const endpoint = dashboardRefreshEndpoints[index];
    return state.status === "ok" && endpoint ? [endpoint] : [];
  });
}

function okData<T>(state: ResourceState<T>): T | null {
  return state.status === "ok" ? state.data : null;
}

function isResourceIssue<T>(state: ResourceState<T>): state is DashboardResourceIssue {
  return (
    state.status === "unauthorized" ||
    state.status === "forbidden" ||
    state.status === "server_error" ||
    state.status === "unavailable"
  );
}

function sortDashboardSavedViews(left: DashboardSavedView, right: DashboardSavedView): number {
  if (left.sortOrder !== right.sortOrder) {
    return left.sortOrder - right.sortOrder;
  }
  return left.name.localeCompare(right.name);
}
