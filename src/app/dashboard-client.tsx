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
    const refresh = () =>
      refreshDashboardState({
        isCancelled: () => cancelled,
        setters: {
          ingestState: setIngestState,
          liveSummary: setLiveSummary,
          workerStatus: setWorkerStatus,
          setupStatus: setSetupStatus,
          todaySignals: setTodaySignals,
          movementSignals: setMovementSignals,
          catalogTrends: setCatalogTrends,
          operatorDigest: setOperatorDigest,
          dashboardSavedViews: setDashboardSavedViews,
          watchRules: setWatchRules,
          notificationDeliveries: setNotificationDeliveries,
          notificationRules: setNotificationRules,
          notificationChannels: setNotificationChannels,
          apiIssues: setApiIssues,
          actionIssues: setActionIssues,
        },
      });
    void refresh();
    const intervalId = window.setInterval(() => {
      void refresh();
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

type DashboardResourcePayloads = {
  ingestState: { state?: GmailIngestState };
  liveSummary: { summary?: LiveLookupDashboardSummary };
  workerStatus: { worker?: LiveWorkerStatus };
  setupStatus: { setup?: AppSetupStatus };
  todaySignals: { signals?: TodayInsight[] };
  movementSignals: { signals?: MovementSignal[] };
  catalogTrends: { trends?: CatalogTrendSummary };
  operatorDigest: { digest?: InsightDigest };
  dashboardSavedViews: { views?: DashboardSavedView[] };
  watchRules: { rules?: WatchRule[] };
  notificationDeliveries: { deliveries?: NotificationDelivery[] };
  notificationRules: { rules?: NotificationRule[] };
  notificationChannels: { channels?: NotificationChannel[] };
};

type DashboardResourceKey = keyof DashboardResourcePayloads;
type DashboardResourceDescriptor = {
  endpoint: string;
  label: string;
};
type DashboardResourceResults = {
  [Key in DashboardResourceKey]: ResourceState<DashboardResourcePayloads[Key]>;
};
type DashboardStateSetters = {
  ingestState: (state: GmailIngestState | null) => void;
  liveSummary: (summary: LiveLookupDashboardSummary | null) => void;
  workerStatus: (status: LiveWorkerStatus | null) => void;
  setupStatus: (status: AppSetupStatus | null) => void;
  todaySignals: (signals: TodayInsight[] | null) => void;
  movementSignals: (signals: MovementSignal[] | null) => void;
  catalogTrends: (trends: CatalogTrendSummary | null) => void;
  operatorDigest: (digest: InsightDigest | null) => void;
  dashboardSavedViews: (views: DashboardSavedView[] | null) => void;
  watchRules: (rules: WatchRule[] | null) => void;
  notificationDeliveries: (deliveries: NotificationDelivery[] | null) => void;
  notificationRules: (rules: NotificationRule[] | null) => void;
  notificationChannels: (channels: NotificationChannel[] | null) => void;
  apiIssues: (issues: DashboardResourceIssue[]) => void;
  actionIssues: (updater: (issues: DashboardResourceIssue[]) => DashboardResourceIssue[]) => void;
};

const dashboardResourceDescriptors = {
  ingestState: { endpoint: "/api/ingest/status", label: "Mail ingest status" },
  liveSummary: { endpoint: "/api/live-lookups/status", label: "Live lookup summary" },
  workerStatus: { endpoint: "/api/live-lookups/worker", label: "Live worker" },
  setupStatus: { endpoint: "/api/settings/status", label: "Setup status" },
  todaySignals: { endpoint: "/api/insights/today?limit=100", label: "Today signals" },
  movementSignals: { endpoint: "/api/insights/movement?limit=100", label: "Movement signals" },
  catalogTrends: { endpoint: "/api/insights/trends?windowDays=7&previousWindowDays=7&limit=20", label: "Catalog trends" },
  operatorDigest: { endpoint: "/api/insights/digest", label: "Operator digest" },
  dashboardSavedViews: { endpoint: "/api/dashboard/saved-views", label: "Dashboard saved views" },
  watchRules: { endpoint: "/api/watch-rules", label: "Watch rules" },
  notificationDeliveries: { endpoint: "/api/notifications/deliveries?limit=100", label: "Notification deliveries" },
  notificationRules: { endpoint: "/api/notifications/rules", label: "Notification rules" },
  notificationChannels: { endpoint: "/api/notifications/channels", label: "Notification channels" },
} satisfies Record<DashboardResourceKey, DashboardResourceDescriptor>;

const dashboardResourceKeys = Object.keys(dashboardResourceDescriptors) as DashboardResourceKey[];

async function refreshDashboardState(
  options: { isCancelled: () => boolean; setters: DashboardStateSetters },
) {
  const resources = await fetchDashboardResources();

  if (!options.isCancelled()) {
    const { setters } = options;
    setters.ingestState(okData(resources.ingestState)?.state ?? null);
    setters.liveSummary(okData(resources.liveSummary)?.summary ?? null);
    setters.workerStatus(okData(resources.workerStatus)?.worker ?? null);
    setters.setupStatus(okData(resources.setupStatus)?.setup ?? null);
    setters.todaySignals(okData(resources.todaySignals)?.signals ?? null);
    setters.movementSignals(okData(resources.movementSignals)?.signals ?? null);
    setters.catalogTrends(okData(resources.catalogTrends)?.trends ?? null);
    setters.operatorDigest(okData(resources.operatorDigest)?.digest ?? null);
    setters.dashboardSavedViews(okData(resources.dashboardSavedViews)?.views ?? null);
    setters.watchRules(okData(resources.watchRules)?.rules ?? null);
    setters.notificationDeliveries(okData(resources.notificationDeliveries)?.deliveries ?? null);
    setters.notificationRules(okData(resources.notificationRules)?.rules ?? null);
    setters.notificationChannels(okData(resources.notificationChannels)?.channels ?? null);
    const resourceStates = dashboardResourceStates(resources);
    setters.apiIssues(resourceStates.filter(isResourceIssue));
    clearActionIssuesForEndpoints(okEndpoints(resources), setters.actionIssues);
  }
}

async function fetchDashboardResources(): Promise<DashboardResourceResults> {
  const entries = await Promise.all(
    dashboardResourceKeys.map(async (key) => {
      const descriptor = dashboardResourceDescriptors[key];
      const state = await fetchDashboardJson<DashboardResourcePayloads[typeof key]>(descriptor.endpoint, descriptor.label);
      return [key, state] as const;
    }),
  );
  return Object.fromEntries(entries) as DashboardResourceResults;
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

function dashboardResourceStates(results: DashboardResourceResults): ResourceState<unknown>[] {
  return dashboardResourceKeys.map((key) => results[key]);
}

function okEndpoints(results: DashboardResourceResults): string[] {
  return dashboardResourceKeys.flatMap((key) => {
    const state = results[key];
    return state.status === "ok" ? [dashboardResourceDescriptors[key].endpoint] : [];
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
