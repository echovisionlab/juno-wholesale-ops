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
} from "@/components/dashboard/types";

export default function Home() {
  const [ingestState, setIngestState] = useState<GmailIngestState | null>(null);
  const [liveSummary, setLiveSummary] = useState<LiveLookupDashboardSummary | null>(null);
  const [workerStatus, setWorkerStatus] = useState<LiveWorkerStatus | null>(null);
  const [setupStatus, setSetupStatus] = useState<AppSetupStatus | null>(null);
  const [workerActionPending, setWorkerActionPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void refreshDashboardState(() => cancelled, setIngestState, setLiveSummary, setWorkerStatus, setSetupStatus);
    const intervalId = window.setInterval(() => {
      void refreshDashboardState(() => cancelled, setIngestState, setLiveSummary, setWorkerStatus, setSetupStatus);
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
      ingestState={ingestState}
      liveSummary={liveSummary}
      workerStatus={workerStatus}
      setupStatus={setupStatus}
      workerActionPending={workerActionPending}
      onWorkerAction={handleWorkerAction}
    />
  );
}

async function refreshDashboardState(
  isCancelled: () => boolean,
  setIngestState: (state: GmailIngestState | null) => void,
  setLiveSummary: (summary: LiveLookupDashboardSummary | null) => void,
  setWorkerStatus: (status: LiveWorkerStatus | null) => void,
  setSetupStatus: (status: AppSetupStatus | null) => void,
) {
  const [ingestPayload, summaryPayload, workerPayload, setupPayload] = await Promise.all([
    fetchJson<{ state?: GmailIngestState }>("/api/ingest/status"),
    fetchJson<{ summary?: LiveLookupDashboardSummary }>("/api/live-lookups/status"),
    fetchJson<{ worker?: LiveWorkerStatus }>("/api/live-lookups/worker"),
    fetchJson<{ setup?: AppSetupStatus }>("/api/settings/status"),
  ]);

  if (!isCancelled()) {
    setIngestState(ingestPayload?.state ?? null);
    setLiveSummary(summaryPayload?.summary ?? null);
    setWorkerStatus(workerPayload?.worker ?? null);
    setSetupStatus(setupPayload?.setup ?? null);
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
