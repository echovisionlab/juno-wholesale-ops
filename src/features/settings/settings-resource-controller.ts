import { useCallback, useEffect, useState } from "react";
import { notifications } from "@mantine/notifications";
import type { SettingsGroup, SettingsResponse } from "@/lib/settings/descriptors";
import type { DraftValues } from "./settings-types";
import { formatSettingsActionError } from "./settings-utils";

export function useSettingsResource({
  initialSettings,
  initialError,
}: {
  initialSettings: SettingsResponse | null;
  initialError: string | null;
}) {
  const [settings, setSettings] = useState<SettingsResponse | null>(initialSettings);
  const [draft, setDraft] = useState<DraftValues>({});
  const [error, setError] = useState<string | null>(initialError);
  const [savingGroup, setSavingGroup] = useState<string | null>(null);
  const shouldLoadOnClient = !initialSettings && !initialError;

  const loadSettings = useCallback(async () => {
    setError(null);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch("/api/settings", { signal: controller.signal });
      const payload = (await response.json().catch(() => ({}))) as SettingsResponse & { error?: string };
      if (!response.ok) {
        setError(payload.error ?? `Settings API returned ${response.status}`);
        return;
      }
      setSettings(payload);
      setDraft({});
    } catch (loadError: unknown) {
      setError(
        loadError instanceof Error && loadError.name === "AbortError"
          ? "Settings API timed out. Check DATABASE_URL and the local Postgres container, then retry."
          : loadError instanceof Error
            ? loadError.message
            : "Settings API unavailable",
      );
    } finally {
      window.clearTimeout(timeoutId);
    }
  }, []);

  useEffect(() => {
    if (shouldLoadOnClient) {
      void Promise.resolve().then(() => loadSettings());
    }
  }, [loadSettings, shouldLoadOnClient]);

  async function saveGroup(group: SettingsGroup) {
    const groupPatch = Object.fromEntries(
      group.settings
        .filter((setting) => setting.editable && Object.prototype.hasOwnProperty.call(draft, setting.key))
        .map((setting) => [setting.key, draft[setting.key]]),
    );
    if (Object.keys(groupPatch).length === 0) {
      return;
    }

    setSavingGroup(group.id);
    setError(null);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ [group.id]: groupPatch }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        settings?: SettingsResponse;
        error?: string;
        issues?: string[];
      };
      if (!response.ok || !payload.settings) {
        const message = formatSettingsActionError(
          payload.issues?.join(" ") ?? payload.error,
          `Settings save returned ${response.status}`,
        );
        setError(message);
        notifications.show({ color: "red", title: "Save failed", message });
        return;
      }
      setSettings(payload.settings);
      setDraft((current) => {
        const next = { ...current };
        for (const key of Object.keys(groupPatch)) {
          delete next[key];
        }
        return next;
      });
    } finally {
      setSavingGroup(null);
    }
  }

  return { settings, setSettings, draft, setDraft, error, setError, savingGroup, loadSettings, saveGroup };
}
