import {
  signalEventTypes,
  signalSeverities,
  type SignalEventType,
  type SignalSeverity,
} from "@/lib/insights/signal-types";
import type { TodayInsight } from "@/lib/insights/repository";
import type { NotificationWebhookFormat } from "./provider-formatters";

export type NotificationChannelType = "in_app" | "webhook" | "logging";
export type NotificationProviderKey =
  | "in_app"
  | "logging"
  | `webhook_${NotificationWebhookFormat}`;
export type NotificationDeliveryStatus = "queued" | "sent" | "failed" | "skipped";
export type NotificationDispatchMode = "dry-run" | "send";

export type NotificationConfig = Record<string, unknown>;

export type NotificationChannel = {
  id: string;
  name: string;
  type: NotificationChannelType;
  enabled: boolean;
  config: NotificationConfig;
  secretRef: string | null;
  configSummary: string;
  createdAt: string;
  updatedAt: string;
};

export type NotificationChannelInput = {
  name: string;
  type: NotificationChannelType;
  enabled?: boolean | null;
  config?: unknown;
  secretRef?: string | null;
};

export type NotificationChannelPatch = Partial<NotificationChannelInput> & {
  id: string;
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

export type NotificationRuleInput = {
  name: string;
  channelId: string;
  enabled?: boolean | null;
  signalTypes?: SignalEventType[] | null;
  severities?: SignalSeverity[] | null;
  minScore?: number | null;
  includeWatchHits?: boolean | null;
  includeDigest?: boolean | null;
  cooldownMinutes?: number | null;
};

export type NotificationRulePatch = Partial<NotificationRuleInput> & {
  id: string;
};

export type NotificationSignal = TodayInsight & {
  metadata: NotificationConfig;
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
  payload: NotificationConfig;
  attempts: number;
  lastError: string | null;
  queuedAt: string;
  sentAt: string | null;
  updatedAt: string;
  signalType: SignalEventType | null;
  severity: SignalSeverity | null;
  score: number | null;
};

export type NotificationQueueResult = {
  queued: number;
  skipped: number;
};

export type NotificationDispatchResult = {
  sent: number;
  failed: number;
  skipped: number;
  dryRun: boolean;
};

export const notificationChannelTypes = ["in_app", "webhook", "logging"] as const;

export const notificationSignalTypes = new Set<SignalEventType>(signalEventTypes);
export const notificationSignalSeverities = new Set<SignalSeverity>(signalSeverities);
