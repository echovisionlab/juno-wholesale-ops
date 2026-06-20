import { type Dispatch, type SetStateAction, useCallback, useState } from "react";
import { notifications } from "@mantine/notifications";
import type { NotificationChannel, NotificationRule } from "@/lib/notifications/types";
import { emptyNotificationChannelDraft, emptyNotificationRuleDraft } from "./settings-options";
import type { NotificationChannelDraft, NotificationRuleDraft } from "./settings-types";
import {
  formatSettingsActionError,
  notificationChannelPayload,
  notificationChannelToDraft,
  notificationRulePayload,
  notificationRuleToDraft,
} from "./settings-utils";

type ErrorSetter = Dispatch<SetStateAction<string | null>>;

export function useNotificationSettingsController({
  initialChannels,
  initialRules,
  setError,
}: {
  initialChannels: NotificationChannel[] | null;
  initialRules: NotificationRule[] | null;
  setError: ErrorSetter;
}) {
  const [channels, setChannels] = useState<NotificationChannel[] | null>(initialChannels);
  const [rules, setRules] = useState<NotificationRule[] | null>(initialRules);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [channelDraft, setChannelDraft] = useState<NotificationChannelDraft>(emptyNotificationChannelDraft);
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [channelModalOpen, setChannelModalOpen] = useState(false);
  const [ruleDraft, setRuleDraft] = useState<NotificationRuleDraft>(emptyNotificationRuleDraft);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [ruleModalOpen, setRuleModalOpen] = useState(false);

  const loadResources = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [channelsResponse, rulesResponse] = await Promise.all([
        fetch("/api/notifications/channels"),
        fetch("/api/notifications/rules"),
      ]);
      const channelsPayload = (await channelsResponse.json().catch(() => ({}))) as {
        channels?: NotificationChannel[];
        error?: string;
      };
      const rulesPayload = (await rulesResponse.json().catch(() => ({}))) as {
        rules?: NotificationRule[];
        error?: string;
      };
      if (!channelsResponse.ok || !channelsPayload.channels) {
        throw new Error(formatSettingsActionError(channelsPayload.error, `Notification channels returned ${channelsResponse.status}`));
      }
      if (!rulesResponse.ok || !rulesPayload.rules) {
        throw new Error(formatSettingsActionError(rulesPayload.error, `Notification rules returned ${rulesResponse.status}`));
      }
      setChannels(channelsPayload.channels);
      setRules(rulesPayload.rules);
    } catch (loadError: unknown) {
      const message = loadError instanceof Error ? loadError.message : "Notification settings unavailable";
      setError(message);
      notifications.show({ color: "red", title: "Notification settings failed", message });
    } finally {
      setLoading(false);
    }
  }, [setError]);

  function openNewChannel() {
    setChannelDraft(emptyNotificationChannelDraft);
    setEditingChannelId(null);
    setChannelModalOpen(true);
  }

  function openEditChannel(channel: NotificationChannel) {
    setChannelDraft(notificationChannelToDraft(channel));
    setEditingChannelId(channel.id);
    setChannelModalOpen(true);
  }

  function closeChannelModal() {
    setChannelModalOpen(false);
    setEditingChannelId(null);
    setChannelDraft(emptyNotificationChannelDraft);
  }

  async function saveChannel() {
    const editing = Boolean(editingChannelId);
    const payload = notificationChannelPayload(channelDraft, editing);
    setPending(editing ? editingChannelId : "channel-new");
    setError(null);
    try {
      const response = await fetch("/api/notifications/channels", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        const message = formatSettingsActionError(result.error, `Notification channel save returned ${response.status}`);
        setError(message);
        notifications.show({ color: "red", title: editing ? "Channel update failed" : "Channel create failed", message });
        return;
      }
      await loadResources();
      closeChannelModal();
      notifications.show({ color: "green", title: editing ? "Channel updated" : "Channel created", message: "Saved" });
    } finally {
      setPending(null);
    }
  }

  async function toggleChannel(id: string, enabled: boolean) {
    setPending(id);
    setError(null);
    try {
      const response = await fetch("/api/notifications/channels", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, enabled }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        const message = formatSettingsActionError(result.error, `Notification channel update returned ${response.status}`);
        setError(message);
        notifications.show({ color: "red", title: "Channel update failed", message });
        return;
      }
      await loadResources();
      notifications.show({ color: "green", title: enabled ? "Channel enabled" : "Channel disabled", message: "Saved" });
    } finally {
      setPending(null);
    }
  }

  async function deleteChannel(id: string) {
    setPending(id);
    setError(null);
    try {
      const response = await fetch("/api/notifications/channels", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        const message = formatSettingsActionError(result.error, `Notification channel delete returned ${response.status}`);
        setError(message);
        notifications.show({ color: "red", title: "Channel delete failed", message });
        return;
      }
      await loadResources();
      notifications.show({ color: "green", title: "Channel deleted", message: "Saved" });
    } finally {
      setPending(null);
    }
  }

  function openNewRule() {
    const firstChannelId = channels?.[0]?.id ?? "";
    setRuleDraft({ ...emptyNotificationRuleDraft, channelId: firstChannelId });
    setEditingRuleId(null);
    setRuleModalOpen(true);
  }

  function openEditRule(rule: NotificationRule) {
    setRuleDraft(notificationRuleToDraft(rule));
    setEditingRuleId(rule.id);
    setRuleModalOpen(true);
  }

  function closeRuleModal() {
    setRuleModalOpen(false);
    setEditingRuleId(null);
    setRuleDraft(emptyNotificationRuleDraft);
  }

  async function saveRule() {
    const editing = Boolean(editingRuleId);
    const payload = notificationRulePayload(ruleDraft);
    setPending(editing ? editingRuleId : "rule-new");
    setError(null);
    try {
      const response = await fetch("/api/notifications/rules", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        const message = formatSettingsActionError(result.error, `Notification rule save returned ${response.status}`);
        setError(message);
        notifications.show({ color: "red", title: editing ? "Rule update failed" : "Rule create failed", message });
        return;
      }
      await loadResources();
      closeRuleModal();
      notifications.show({ color: "green", title: editing ? "Rule updated" : "Rule created", message: "Saved" });
    } finally {
      setPending(null);
    }
  }

  async function toggleRule(id: string, enabled: boolean) {
    setPending(id);
    setError(null);
    try {
      const response = await fetch("/api/notifications/rules", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, enabled }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        const message = formatSettingsActionError(result.error, `Notification rule update returned ${response.status}`);
        setError(message);
        notifications.show({ color: "red", title: "Rule update failed", message });
        return;
      }
      await loadResources();
      notifications.show({ color: "green", title: enabled ? "Rule enabled" : "Rule disabled", message: "Saved" });
    } finally {
      setPending(null);
    }
  }

  async function deleteRule(id: string) {
    setPending(id);
    setError(null);
    try {
      const response = await fetch("/api/notifications/rules", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        const message = formatSettingsActionError(result.error, `Notification rule delete returned ${response.status}`);
        setError(message);
        notifications.show({ color: "red", title: "Rule delete failed", message });
        return;
      }
      await loadResources();
      notifications.show({ color: "green", title: "Rule deleted", message: "Saved" });
    } finally {
      setPending(null);
    }
  }

  async function runNotificationAction(
    action: "queue" | "dispatch" | "refresh",
    endpoint: string,
    title: string,
  ) {
    const pendingKey = `notifications-${action}`;
    setPending(pendingKey);
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "dry-run", limit: 100 }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        queued?: { queued?: number; skipped?: number };
        dispatched?: { skipped?: number; dryRun?: boolean };
        skipped?: number;
      };
      if (!response.ok) {
        const message = formatSettingsActionError(result.error, `${title} failed`);
        setError(message);
        notifications.show({ color: "red", title: `${title} failed`, message });
        return;
      }
      notifications.show({ color: "green", title, message: notificationActionSummary(action, result) });
      await loadResources();
    } finally {
      setPending(null);
    }
  }

  function queueNotifications() {
    return runNotificationAction("queue", "/api/notifications/queue", "Notifications queued");
  }

  function dryRunDispatch() {
    return runNotificationAction("dispatch", "/api/notifications/dispatch", "Dry-run complete");
  }

  function refreshNotifications() {
    return runNotificationAction("refresh", "/api/notifications/refresh", "Notifications refreshed");
  }

  return {
    channels,
    rules,
    loading,
    pending,
    channelDraft,
    ruleDraft,
    editingChannelId,
    editingRuleId,
    channelModalOpen,
    ruleModalOpen,
    loadResources,
    setChannelDraft,
    setRuleDraft,
    openNewChannel,
    openEditChannel,
    closeChannelModal,
    saveChannel,
    deleteChannel,
    toggleChannel,
    openNewRule,
    openEditRule,
    closeRuleModal,
    saveRule,
    deleteRule,
    toggleRule,
    queueNotifications,
    dryRunDispatch,
    refreshNotifications,
  };
}

function notificationActionSummary(
  action: "queue" | "dispatch" | "refresh",
  result: {
    queued?: { queued?: number; skipped?: number };
    dispatched?: { skipped?: number; dryRun?: boolean };
    skipped?: number;
  },
): string {
  if (action === "queue") {
    return "Queue updated";
  }
  if (action === "dispatch") {
    return "No external sends";
  }
  return result.dispatched?.dryRun === false ? "Refreshed" : "Refreshed without external sends";
}
