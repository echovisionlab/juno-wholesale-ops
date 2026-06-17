"use client";

import { useEffect, useState } from "react";
import { CatalogOpsDashboard } from "@/components/dashboard/CatalogOpsDashboard";
import { dashboardFixture } from "@/components/dashboard/dashboard.fixtures";
import type {
  AppSetupStatus,
  GmailIngestState,
  LiveLookupDashboardSummary,
  LiveWorkerAction,
  LiveWorkerStatus,
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
  const [watchRules, setWatchRules] = useState<WatchRule[] | null>(null);
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
      setWatchRules,
    );
    const intervalId = window.setInterval(() => {
      void refreshDashboardState(
        () => cancelled,
        setIngestState,
        setLiveSummary,
        setWorkerStatus,
        setSetupStatus,
        setTodaySignals,
        setWatchRules,
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
      watchRules={watchRules}
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
  setWatchRules: (rules: WatchRule[] | null) => void,
) {
  const [ingestPayload, summaryPayload, workerPayload, setupPayload, signalsPayload, watchRulesPayload] = await Promise.all([
    fetchJson<{ state?: GmailIngestState }>("/api/ingest/status"),
    fetchJson<{ summary?: LiveLookupDashboardSummary }>("/api/live-lookups/status"),
    fetchJson<{ worker?: LiveWorkerStatus }>("/api/live-lookups/worker"),
    fetchJson<{ setup?: AppSetupStatus }>("/api/settings/status"),
    fetchJson<{ signals?: TodayInsight[] }>("/api/insights/today?limit=100"),
    fetchJson<{ rules?: WatchRule[] }>("/api/watch-rules"),
  ]);

  if (!isCancelled()) {
    setIngestState(ingestPayload?.state ?? null);
    setLiveSummary(summaryPayload?.summary ?? null);
    setWorkerStatus(workerPayload?.worker ?? null);
    setSetupStatus(setupPayload?.setup ?? null);
    setTodaySignals(signalsPayload?.signals ?? null);
    setWatchRules(watchRulesPayload?.rules ?? null);
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
