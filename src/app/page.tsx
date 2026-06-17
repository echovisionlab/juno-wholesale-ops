"use client";

import { useEffect, useState } from "react";
import { CatalogOpsDashboard } from "@/components/dashboard/CatalogOpsDashboard";
import { dashboardFixture } from "@/components/dashboard/dashboard.fixtures";
import type {
  AppSetupStatus,
  CatalogTrendSummary,
  GmailIngestState,
  InsightDigest,
  LiveLookupDashboardSummary,
  LiveWorkerAction,
  LiveWorkerStatus,
  MovementSignal,
  NotificationChannel,
  NotificationDelivery,
  NotificationRule,
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
  const [watchRules, setWatchRules] = useState<WatchRule[] | null>(null);
  const [notificationDeliveries, setNotificationDeliveries] = useState<NotificationDelivery[] | null>(null);
  const [notificationRules, setNotificationRules] = useState<NotificationRule[] | null>(null);
  const [notificationChannels, setNotificationChannels] = useState<NotificationChannel[] | null>(null);
  const [workerActionPending, setWorkerActionPending] = useState(false);
  const [watchRuleActionPending, setWatchRuleActionPending] = useState(false);

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
      setWatchRules,
      setNotificationDeliveries,
      setNotificationRules,
      setNotificationChannels,
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
        setWatchRules,
        setNotificationDeliveries,
        setNotificationRules,
        setNotificationChannels,
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
      watchRules={watchRules}
      notificationDeliveries={notificationDeliveries}
      notificationRules={notificationRules}
      notificationChannels={notificationChannels}
      workerActionPending={workerActionPending}
      watchRuleActionPending={watchRuleActionPending}
      onWorkerAction={handleWorkerAction}
      onCreateWatchRule={handleCreateWatchRule}
      onToggleWatchRule={handleToggleWatchRule}
      onDeleteWatchRule={handleDeleteWatchRule}
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
  setWatchRules: (rules: WatchRule[] | null) => void,
  setNotificationDeliveries: (deliveries: NotificationDelivery[] | null) => void,
  setNotificationRules: (rules: NotificationRule[] | null) => void,
  setNotificationChannels: (channels: NotificationChannel[] | null) => void,
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
    watchRulesPayload,
    notificationDeliveriesPayload,
    notificationRulesPayload,
    notificationChannelsPayload,
  ] = await Promise.all([
    fetchJson<{ state?: GmailIngestState }>("/api/ingest/status"),
    fetchJson<{ summary?: LiveLookupDashboardSummary }>("/api/live-lookups/status"),
    fetchJson<{ worker?: LiveWorkerStatus }>("/api/live-lookups/worker"),
    fetchJson<{ setup?: AppSetupStatus }>("/api/settings/status"),
    fetchJson<{ signals?: TodayInsight[] }>("/api/insights/today?limit=100"),
    fetchJson<{ signals?: MovementSignal[] }>("/api/insights/movement?limit=100"),
    fetchJson<{ trends?: CatalogTrendSummary }>("/api/insights/trends?windowDays=7&previousWindowDays=7&limit=20"),
    fetchJson<{ digest?: InsightDigest }>("/api/insights/digest"),
    fetchJson<{ rules?: WatchRule[] }>("/api/watch-rules"),
    fetchJson<{ deliveries?: NotificationDelivery[] }>("/api/notifications/deliveries?limit=100"),
    fetchJson<{ rules?: NotificationRule[] }>("/api/notifications/rules"),
    fetchJson<{ channels?: NotificationChannel[] }>("/api/notifications/channels"),
  ]);

  if (!isCancelled()) {
    setIngestState(ingestPayload?.state ?? null);
    setLiveSummary(summaryPayload?.summary ?? null);
    setWorkerStatus(workerPayload?.worker ?? null);
    setSetupStatus(setupPayload?.setup ?? null);
    setTodaySignals(signalsPayload?.signals ?? null);
    setMovementSignals(movementPayload?.signals ?? null);
    setCatalogTrends(trendsPayload?.trends ?? null);
    setOperatorDigest(digestPayload?.digest ?? null);
    setWatchRules(watchRulesPayload?.rules ?? null);
    setNotificationDeliveries(notificationDeliveriesPayload?.deliveries ?? null);
    setNotificationRules(notificationRulesPayload?.rules ?? null);
    setNotificationChannels(notificationChannelsPayload?.channels ?? null);
  }
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url);
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}
