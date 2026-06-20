import { type Dispatch, type SetStateAction, useState } from "react";
import { notifications } from "@mantine/notifications";
import type { SettingsResponse } from "@/lib/settings/descriptors";
import { emptySsoProviderDraft } from "./settings-options";
import type { SsoProviderDraft } from "./settings-types";
import { formatSettingsActionError } from "./settings-utils";

type SettingsSetter = Dispatch<SetStateAction<SettingsResponse | null>>;
type ErrorSetter = Dispatch<SetStateAction<string | null>>;

export function useSsoProviderController({
  setSettings,
  setError,
}: {
  setSettings: SettingsSetter;
  setError: ErrorSetter;
}) {
  const [draft, setDraft] = useState<SsoProviderDraft>(emptySsoProviderDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  function resetDraft() {
    setDraft(emptySsoProviderDraft);
    setEditingId(null);
  }

  function openNew() {
    resetDraft();
    setModalOpen(true);
  }

  function openEdit(nextDraft: SsoProviderDraft) {
    setDraft(nextDraft);
    setEditingId(nextDraft.id ?? null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    resetDraft();
  }

  async function save() {
    const editing = Boolean(editingId);
    const payload = {
      ...draft,
      id: editingId ?? undefined,
      adminEmailAllowlist: draft.adminEmailAllowlist,
      adminClaim: draft.adminClaim,
      adminClaimValue: draft.adminClaimValue,
    };
    if (editing && payload.clientSecret.trim() === "") {
      delete (payload as Partial<SsoProviderDraft>).clientSecret;
    }
    setPending(editing ? editingId : "new");
    setError(null);
    try {
      const response = await fetch("/api/settings/auth/sso-providers", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => ({}))) as {
        settings?: SettingsResponse;
        error?: string;
        issues?: string[];
      };
      if (!response.ok || !result.settings) {
        const message = formatSettingsActionError(
          result.issues?.join(" ") ?? result.error,
          `SSO provider save returned ${response.status}`,
        );
        setError(message);
        notifications.show({ color: "red", title: editing ? "Provider update failed" : "Provider create failed", message });
        return;
      }
      setSettings(result.settings);
      closeModal();
      notifications.show({ color: "green", title: editing ? "Provider updated" : "Provider created", message: "Saved" });
    } finally {
      setPending(null);
    }
  }

  async function toggle(id: string, enabled: boolean) {
    setPending(id);
    setError(null);
    try {
      const response = await fetch("/api/settings/auth/sso-providers", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, enabled }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        settings?: SettingsResponse;
        error?: string;
        issues?: string[];
      };
      if (!response.ok || !result.settings) {
        const message = formatSettingsActionError(
          result.issues?.join(" ") ?? result.error,
          `SSO provider update returned ${response.status}`,
        );
        setError(message);
        notifications.show({ color: "red", title: "Provider update failed", message });
        return;
      }
      setSettings(result.settings);
      notifications.show({ color: "green", title: enabled ? "Provider enabled" : "Provider disabled", message: "Saved" });
    } finally {
      setPending(null);
    }
  }

  async function deleteProvider(id: string) {
    setPending(id);
    setError(null);
    try {
      const response = await fetch("/api/settings/auth/sso-providers", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        settings?: SettingsResponse;
        error?: string;
      };
      if (!response.ok || !result.settings) {
        const message = formatSettingsActionError(result.error, `SSO provider delete returned ${response.status}`);
        setError(message);
        notifications.show({ color: "red", title: "Provider delete failed", message });
        return;
      }
      setSettings(result.settings);
      if (editingId === id) {
        resetDraft();
      }
      notifications.show({ color: "green", title: "Provider deleted", message: "Saved" });
    } finally {
      setPending(null);
    }
  }

  return { draft, editingId, pending, modalOpen, setDraft, openNew, openEdit, closeModal, save, toggle, deleteProvider };
}
