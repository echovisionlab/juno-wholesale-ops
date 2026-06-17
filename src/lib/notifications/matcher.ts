import type { SignalEventType } from "@/lib/insights/repository";
import type { NotificationRule, NotificationSignal } from "./types";

export type CooldownDelivery = {
  ruleId: string | null;
  identityId: string | null;
  signalType: SignalEventType | null;
  queuedAt: string;
  status: "queued" | "sent" | "failed" | "skipped";
};

export function notificationRuleMatchesSignal(rule: NotificationRule, signal: NotificationSignal): boolean {
  if (!rule.enabled || !rule.channelEnabled) {
    return false;
  }
  if (signal.type === "watch_hit" && !rule.includeWatchHits) {
    return false;
  }
  if (rule.signalTypes.length > 0 && !rule.signalTypes.includes(signal.type)) {
    return false;
  }
  if (rule.severities.length > 0 && !rule.severities.includes(signal.severity)) {
    return false;
  }
  return signal.score >= rule.minScore;
}

export function buildSignalDeliveryKey(options: {
  ruleId: string;
  channelId: string;
  signalEventId: string;
}): string {
  return `signal:${options.ruleId}:${options.channelId}:${options.signalEventId}`;
}

export function buildDigestDeliveryKey(options: {
  ruleId: string;
  channelId: string;
  digestDate: string;
}): string {
  return `digest:${options.ruleId}:${options.channelId}:${options.digestDate}`;
}

export function shouldSkipForCooldown(options: {
  rule: NotificationRule;
  signal: NotificationSignal;
  deliveries: CooldownDelivery[];
  now?: Date;
}): boolean {
  if (options.rule.cooldownMinutes <= 0 || !options.signal.item.identityId) {
    return false;
  }

  const now = options.now ?? new Date();
  const cutoff = now.getTime() - options.rule.cooldownMinutes * 60_000;
  return options.deliveries.some((delivery) => {
    if (delivery.ruleId !== options.rule.id) {
      return false;
    }
    if (delivery.identityId !== options.signal.item.identityId || delivery.signalType !== options.signal.type) {
      return false;
    }
    if (delivery.status !== "queued" && delivery.status !== "sent") {
      return false;
    }
    return new Date(delivery.queuedAt).getTime() >= cutoff;
  });
}
