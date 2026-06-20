import { type Dispatch, type SetStateAction, useState } from "react";
import { notifications } from "@mantine/notifications";
import type { SettingsResponse } from "@/lib/settings/descriptors";
import { formatJunoSessionCheckStatus, formatSettingsActionError } from "./settings-utils";

type SettingsSetter = Dispatch<SetStateAction<SettingsResponse | null>>;
type ErrorSetter = Dispatch<SetStateAction<string | null>>;

export function useJunoLiveController({
  setSettings,
  setError,
}: {
  setSettings: SettingsSetter;
  setError: ErrorSetter;
}) {
  const [pending, setPending] = useState(false);

  async function testSession() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/settings/actions/test-juno-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "smoke" }),
      });
      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown> & {
        settings?: SettingsResponse;
        error?: string;
      };
      if (!response.ok) {
        const message = formatSettingsActionError(payload.error, `Juno session check returned ${response.status}`);
        setError(message);
        notifications.show({ color: "red", title: "Check failed", message });
      }
      if (payload.settings) {
        setSettings(payload.settings);
      }
      if (response.ok) {
        notifications.show({
          color: payload.ok === false ? "yellow" : "green",
          title: "Juno session check finished",
          message: formatJunoSessionCheckStatus(payload.status),
        });
      }
    } finally {
      setPending(false);
    }
  }

  return { pending, testSession };
}
