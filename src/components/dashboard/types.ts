import type { ComponentType } from "react";

export type DashboardIcon = ComponentType<{
  size?: number;
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

export type StatCardData = {
  label: string;
  value: string;
  detail: string;
  icon: DashboardIcon;
};

export type PipelineItem = {
  title: string;
  body: string;
  status: string;
};

export type GmailIngestState = {
  lastQuery: string | null;
  lastQueryWindowFrom: string | null;
  lastQueryWindowTo: string | null;
  lastQueryStartedAt: string | null;
  lastQueryFinishedAt: string | null;
  lastQueryStatus: "running" | "succeeded" | "failed" | null;
  lastQueryError: string | null;
  lastQueryMessageCount: number;
  lastQueryAttachmentCount: number;
  lastSuccessfulMessageReceivedAt: string | null;
  lastIngestedSnapshotId: string | null;
  lastIngestedCatalogDate: string | null;
  lastIngestedContentHash: string | null;
};

export type LiveLookupDashboardSummary = {
  queued: number;
  running: number;
  succeeded: number;
  failed: number;
  blocked: number;
  manualRequired: number;
  latestObservedAt: string | null;
  latestDisplayStock: string | null;
};

export type LiveWorkerAction = "start" | "stop" | "restart";

export type LiveWorkerStatus = {
  state: "stopped" | "running" | "exited";
  pid: number | null;
  startedAt: string | null;
  stoppedAt: string | null;
  exitCode: number | null;
  signal: string | null;
  lastError: string | null;
  command: string;
  args: string[];
  recentLogs: Array<{
    stream: "stdout" | "stderr";
    line: string;
    occurredAt: string;
  }>;
};

export type SignalEventType = "new_arrival" | "watch_hit" | "low_catalog_stock" | "exclude_match";

export type SignalSeverity = "info" | "watch" | "warning" | "critical";

export type TodayInsight = {
  signalId: string;
  type: SignalEventType;
  severity: SignalSeverity;
  score: number;
  title: string;
  detail: string;
  createdAt: string;
  item: {
    identityId: string;
    junoId: string | null;
    artist: string | null;
    title: string | null;
    label: string | null;
    catNo: string | null;
    genre: string | null;
    medium: string | null;
    stock: number | null;
    dealerPriceGbp: string | null;
    releaseDate: string | null;
  };
  reasons: string[];
};

export type WatchRuleType = "artist" | "label" | "genre" | "keyword" | "exclude_keyword";

export type WatchRule = {
  id: string;
  type: WatchRuleType;
  pattern: string;
  patternNorm: string;
  weight: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WatchRuleDraft = {
  type: WatchRuleType;
  pattern: string;
  weight?: number | null;
};

export type SetupStepState = "complete" | "missing" | "disabled" | "warning";

export type SetupSettingSource = "database" | "runtime" | "unset";

export type SetupSettingState = "configured" | "missing" | "disabled";

export type SetupSetting = {
  key: string;
  label: string;
  source: SetupSettingSource;
  state: SetupSettingState;
  value: string;
  secret?: boolean;
};

export type SetupGuardrailState = "ok" | "warning" | "blocked";

export type SetupGuardrail = {
  label: string;
  state: SetupGuardrailState;
  detail: string;
};

export type SetupStep = {
  id: "database" | "gmail" | "juno" | "auth";
  label: string;
  state: SetupStepState;
  detail: string;
  action: string | null;
  missing: string[];
  settings: SetupSetting[];
  guardrails: SetupGuardrail[];
};

export type AppSetupStatus = {
  ready: boolean;
  steps: SetupStep[];
};
