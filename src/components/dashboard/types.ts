import type { ComponentType } from "react";
import type { DashboardSavedView as StoredDashboardSavedView } from "@/lib/dashboard/saved-views-repository";
import type { DashboardSignalFilters } from "@/lib/dashboard/signal-filters";
import type { GmailIngestState as StoredGmailIngestState } from "@/lib/ingest/repository";
import type { SignalEventType, SignalSeverity, TodayInsight } from "@/lib/insights/repository";
import type { CatalogTrendSummary, InsightDigest, TrendBucket } from "@/lib/insights/trend-repository";
import type { WatchRule, WatchRuleType } from "@/lib/insights/watch-matcher";
import type { LiveLookupSummary } from "@/lib/juno-live/repository";
import type { PublicWorkerProcessStatus } from "@/lib/juno-live/worker-process";
import type {
  NotificationChannel,
  NotificationChannelType,
  NotificationDelivery,
  NotificationDeliveryStatus,
  NotificationRule,
} from "@/lib/notifications/types";
import type { AppSetupStatus, SetupGuardrail, SetupStep } from "@/lib/setup/status";

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
};

export type GmailIngestState = StoredGmailIngestState;
export type LiveLookupDashboardSummary = LiveLookupSummary;

export type LiveWorkerAction = "start" | "stop" | "restart";
export type LiveWorkerStatus = PublicWorkerProcessStatus;

export type MovementSignal = TodayInsight;

export type DashboardSavedView = StoredDashboardSavedView;

export type DashboardSavedViewDraft = {
  name: string;
  filters: DashboardSignalFilters;
};

export type WatchRuleDraft = {
  type: WatchRuleType;
  pattern: string;
  weight?: number | null;
};

export type {
  AppSetupStatus,
  CatalogTrendSummary,
  InsightDigest,
  NotificationChannel,
  NotificationChannelType,
  NotificationDelivery,
  NotificationDeliveryStatus,
  NotificationRule,
  SetupGuardrail,
  SetupStep,
  SignalEventType,
  SignalSeverity,
  TodayInsight,
  TrendBucket,
  WatchRule,
  WatchRuleType,
};
