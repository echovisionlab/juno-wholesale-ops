"use client";

import { useEffect, useState } from "react";
import { CatalogOpsDashboard } from "@/components/dashboard/CatalogOpsDashboard";
import { dashboardFixture } from "@/components/dashboard/dashboard.fixtures";
import type { LiveLookupDashboardSummary, LiveWorkerAction, LiveWorkerStatus } from "@/components/dashboard/types";

export default function Home() {
  const [liveSummary, setLiveSummary] = useState<LiveLookupDashboardSummary | null>(null);
  const [workerStatus, setWorkerStatus] = useState<LiveWorkerStatus | null>(null);
  const [workerActionPending, setWorkerActionPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void refreshLiveState(() => cancelled, setLiveSummary, setWorkerStatus);
    const intervalId = window.setInterval(() => {
      void refreshLiveState(() => cancelled, setLiveSummary, setWorkerStatus);
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

  return (
    <CatalogOpsDashboard
      {...dashboardFixture}
      liveSummary={liveSummary}
      workerStatus={workerStatus}
      workerActionPending={workerActionPending}
      onWorkerAction={handleWorkerAction}
    />
  );
}

async function refreshLiveState(
  isCancelled: () => boolean,
  setLiveSummary: (summary: LiveLookupDashboardSummary | null) => void,
  setWorkerStatus: (status: LiveWorkerStatus | null) => void,
) {
  const [summaryPayload, workerPayload] = await Promise.all([
    fetchJson<{ summary?: LiveLookupDashboardSummary }>("/api/live-lookups/status"),
    fetchJson<{ worker?: LiveWorkerStatus }>("/api/live-lookups/worker"),
  ]);

  if (!isCancelled()) {
    setLiveSummary(summaryPayload?.summary ?? null);
    setWorkerStatus(workerPayload?.worker ?? null);
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
