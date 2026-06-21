import {
  signalSeverityLabels,
  signalTypeLabels,
  type SignalEventType,
  type SignalSeverity,
} from "@/lib/insights/signal-types";
import type { WatchRuleType } from "@/lib/insights/watch-matcher";
import type { NotificationChannelType, NotificationDeliveryStatus } from "@/lib/notifications/types";

const notificationDeliveryStatusLabels: Record<NotificationDeliveryStatus, string> = {
  queued: "Queued",
  sent: "Sent",
  failed: "Failed",
  skipped: "Skipped",
};

const notificationChannelTypeLabels: Record<NotificationChannelType, string> = {
  in_app: "In-app",
  webhook: "Webhook",
  logging: "Logging",
};

const watchRuleTypeLabels: Record<WatchRuleType, string> = {
  artist: "Artist",
  label: "Label",
  genre: "Genre",
  keyword: "Keyword",
  exclude_keyword: "Exclude keyword",
};

export const watchRuleTypeOptions: Array<{ value: WatchRuleType; label: string }> = [
  { value: "artist", label: watchRuleTypeLabels.artist },
  { value: "label", label: watchRuleTypeLabels.label },
  { value: "genre", label: watchRuleTypeLabels.genre },
  { value: "keyword", label: watchRuleTypeLabels.keyword },
  { value: "exclude_keyword", label: watchRuleTypeLabels.exclude_keyword },
];

export function formatSignalType(type: SignalEventType): string {
  return signalTypeLabels[type];
}

export function formatSignalSeverity(severity: SignalSeverity): string {
  return signalSeverityLabels[severity];
}

export function formatNotificationDeliveryStatus(status: NotificationDeliveryStatus): string {
  return notificationDeliveryStatusLabels[status];
}

export function formatNotificationChannelType(type: NotificationChannelType): string {
  return notificationChannelTypeLabels[type];
}

export function formatWatchRuleType(type: WatchRuleType): string {
  return watchRuleTypeLabels[type];
}
