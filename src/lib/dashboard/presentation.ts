import type { SignalEventType, SignalSeverity } from "@/lib/insights/repository";
import type { WatchRuleType } from "@/lib/insights/watch-matcher";
import type { NotificationChannelType, NotificationDeliveryStatus } from "@/lib/notifications/types";

const signalTypeLabels: Record<SignalEventType, string> = {
  new_arrival: "New arrival",
  watch_hit: "Watch hit",
  low_catalog_stock: "Low observed stock",
  exclude_match: "Exclude match",
  observed_restock: "Observed restock",
  observed_stock_drop: "Observed stock change",
  observed_live_low_stock: "Low live stock",
  observed_status_change: "Observed status change",
  observed_price_change: "Observed price change",
  fast_mover_candidate: "Fast mover candidate",
  trend_spike: "Catalog trend spike",
};

const signalSeverityLabels: Record<SignalSeverity, string> = {
  info: "Info",
  watch: "Watch",
  warning: "Warning",
  critical: "Critical",
};

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
