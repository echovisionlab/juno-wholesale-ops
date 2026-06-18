import type { ComponentType } from "react";

export type DashboardIcon = ComponentType<{
  size?: number;
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

export type ResourceState<T> =
  | { status: "loading" }
  | { status: "ok"; data: T }
  | { status: "empty"; message: string }
  | { status: "unauthorized"; message: string; httpStatus: 401; endpoint: string; label: string }
  | { status: "forbidden"; message: string; httpStatus: 403; endpoint: string; label: string }
  | { status: "server_error"; message: string; httpStatus: number; endpoint: string; label: string; error?: string }
  | { status: "unavailable"; message: string; endpoint: string; label: string; httpStatus?: number; error?: string };

export type DashboardResourceIssue = Extract<
  ResourceState<unknown>,
  { status: "unauthorized" | "forbidden" | "server_error" | "unavailable" }
>;

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

export type SignalEventType =
  | "new_arrival"
  | "watch_hit"
  | "low_catalog_stock"
  | "exclude_match"
  | "observed_restock"
  | "observed_stock_drop"
  | "observed_live_low_stock"
  | "observed_status_change"
  | "observed_price_change"
  | "fast_mover_candidate"
  | "trend_spike";

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
    identityId: string | null;
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

export type MovementSignal = TodayInsight;

export type TrendBucket = {
  key: string;
  label: string;
  currentCount: number;
  previousCount: number;
  delta: number;
  percentChange: number | null;
  watchHitCount: number;
};

export type CatalogTrendSummary = {
  window: {
    currentFrom: string;
    currentTo: string;
    previousFrom: string;
    previousTo: string;
  };
  genres: TrendBucket[];
  labels: TrendBucket[];
  watchOverlap: TrendBucket[];
};

export type InsightDigest = {
  generatedAt: string;
  counts: {
    watchHitsToday: number;
    lowCatalogStockToday: number;
    lowLiveStockToday: number;
    restocksToday: number;
    fastMoverCandidatesToday: number;
  };
  topSignals: TodayInsight[];
  topGenres: TrendBucket[];
  topLabels: TrendBucket[];
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

export type NotificationChannelType = "in_app" | "webhook" | "logging";
export type NotificationDeliveryStatus = "queued" | "sent" | "failed" | "skipped";

export type NotificationChannel = {
  id: string;
  name: string;
  type: NotificationChannelType;
  enabled: boolean;
  config: Record<string, unknown>;
  secretRef: string | null;
  configSummary: string;
  createdAt: string;
  updatedAt: string;
};

export type NotificationRule = {
  id: string;
  name: string;
  channelId: string;
  channelName: string;
  channelType: NotificationChannelType;
  channelEnabled: boolean;
  enabled: boolean;
  signalTypes: SignalEventType[];
  severities: SignalSeverity[];
  minScore: number;
  includeWatchHits: boolean;
  includeDigest: boolean;
  cooldownMinutes: number;
  createdAt: string;
  updatedAt: string;
};

export type NotificationDelivery = {
  id: string;
  ruleId: string | null;
  ruleName: string | null;
  channelId: string | null;
  channelName: string | null;
  channelType: NotificationChannelType | null;
  signalEventId: string | null;
  digestKey: string | null;
  status: NotificationDeliveryStatus;
  deliveryKey: string;
  subject: string;
  body: string;
  payload: Record<string, unknown>;
  attempts: number;
  lastError: string | null;
  queuedAt: string;
  sentAt: string | null;
  updatedAt: string;
  signalType: SignalEventType | null;
  severity: SignalSeverity | null;
  score: number | null;
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
  id: "database" | "data" | "mail" | "juno" | "auth";
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
