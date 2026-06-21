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
      );
    }, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  async function handleWorkerAction(action: LiveWorkerAction) {
    setWorkerActionPending(true);
    try {
      const response = await fetch("/api/live-lookups/worker", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = response.ok ? ((await response.json()) as { worker?: LiveWorkerStatus }) : null;
      setWorkerStatus(payload?.worker ?? null);
    } finally {
      setWorkerActionPending(false);
    }
  }

  async function handleCreateWatchRule(draft: WatchRuleDraft) {
    setWatchRuleActionPending(true);
    try {
      const response = await fetch("/api/watch-rules", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      const payload = response.ok ? ((await response.json()) as { rule?: WatchRule }) : null;
      const createdRule = payload?.rule;
      if (createdRule) {
        setWatchRules((rules) => [createdRule, ...(rules ?? [])]);
      }
    } finally {
      setWatchRuleActionPending(false);
    }
  }

  async function handleToggleWatchRule(rule: WatchRule) {
    setWatchRuleActionPending(true);
    try {
      const response = await fetch("/api/watch-rules", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: rule.id, enabled: !rule.enabled }),
      });
      const payload = response.ok ? ((await response.json()) as { rule?: WatchRule }) : null;
      const updatedRule = payload?.rule;
      if (updatedRule) {
        setWatchRules((rules) => (rules ?? []).map((entry) => (entry.id === updatedRule.id ? updatedRule : entry)));
      }
    } finally {
      setWatchRuleActionPending(false);
    }
  }

  async function handleDeleteWatchRule(rule: WatchRule) {
    setWatchRuleActionPending(true);
    try {
      const response = await fetch("/api/watch-rules", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: rule.id }),
      });
      if (response.ok) {
        setWatchRules((rules) => (rules ?? []).filter((entry) => entry.id !== rule.id));
      }
    } finally {
      setWatchRuleActionPending(false);
    }
  }

  async function handleCreateDashboardSavedView(draft: DashboardSavedViewDraft) {
    setDashboardSavedViewActionPending(true);
    try {
      const response = await fetch("/api/dashboard/saved-views", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      const payload = response.ok ? ((await response.json()) as { view?: DashboardSavedView }) : null;
      const createdView = payload?.view;
      if (createdView) {
        setDashboardSavedViews((views) => [...(views ?? []), createdView].sort(sortDashboardSavedViews));
      }
    } finally {
      setDashboardSavedViewActionPending(false);
    }
  }

  async function handleUpdateDashboardSavedView(view: DashboardSavedView, filters: DashboardSavedView["filters"]) {
    setDashboardSavedViewActionPending(true);
    try {
      const response = await fetch("/api/dashboard/saved-views", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: view.id, name: view.name, filters }),
      });
      const payload = response.ok ? ((await response.json()) as { view?: DashboardSavedView }) : null;
      const updatedView = payload?.view;
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
    setDashboardSavedViewActionPending(true);
    try {
      const response = await fetch("/api/dashboard/saved-views", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: view.id }),
      });
      if (response.ok) {
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
      apiIssues={apiIssues}
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
    fetchDashboardJson<{ state?: GmailIngestState }>("/api/ingest/status", "Mail ingest status"),
    fetchDashboardJson<{ summary?: LiveLookupDashboardSummary }>("/api/live-lookups/status", "Live lookup summary"),
    fetchDashboardJson<{ worker?: LiveWorkerStatus }>("/api/live-lookups/worker", "Live worker"),
    fetchDashboardJson<{ setup?: AppSetupStatus }>("/api/settings/status", "Setup status"),
    fetchDashboardJson<{ signals?: TodayInsight[] }>("/api/insights/today?limit=100", "Today signals"),
    fetchDashboardJson<{ signals?: MovementSignal[] }>("/api/insights/movement?limit=100", "Movement signals"),
    fetchDashboardJson<{ trends?: CatalogTrendSummary }>("/api/insights/trends?windowDays=7&previousWindowDays=7&limit=20", "Catalog trends"),
    fetchDashboardJson<{ digest?: InsightDigest }>("/api/insights/digest", "Operator digest"),
    fetchDashboardJson<{ views?: DashboardSavedView[] }>("/api/dashboard/saved-views", "Dashboard saved views"),
    fetchDashboardJson<{ rules?: WatchRule[] }>("/api/watch-rules", "Watch rules"),
    fetchDashboardJson<{ deliveries?: NotificationDelivery[] }>("/api/notifications/deliveries?limit=100", "Notification deliveries"),
    fetchDashboardJson<{ rules?: NotificationRule[] }>("/api/notifications/rules", "Notification rules"),
    fetchDashboardJson<{ channels?: NotificationChannel[] }>("/api/notifications/channels", "Notification channels"),
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
  }
}

export async function fetchDashboardJson<T>(url: string, label: string): Promise<ResourceState<T>> {
  try {
    const response = await fetch(url);
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
