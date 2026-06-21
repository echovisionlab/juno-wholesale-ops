import { type Dispatch, type SetStateAction, useState } from "react";
import { notifications } from "@mantine/notifications";
import type { PublicMailboxSource } from "@/lib/ingest/mail-source";
import type { MailSourceConnectionTestResult } from "@/lib/ingest/mail-source-test";
import { emptyMailSourceDraft } from "./settings-options";
import type { MailSourceDraft, MailSourceTestState } from "./settings-types";
import { formatMailSourceTestStatus, formatSettingsActionError, mailSourcePayload, mailSourceToDraft } from "./settings-utils";

type ErrorSetter = Dispatch<SetStateAction<string | null>>;

export function useMailSourcesController({
  loadSettings,
  setError,
}: {
  loadSettings: () => Promise<void>;
  setError: ErrorSetter;
}) {
  const [draft, setDraft] = useState<MailSourceDraft>(emptyMailSourceDraft);
  const [testResult, setTestResult] = useState<MailSourceTestState>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  function resetDraft() {
    setDraft(emptyMailSourceDraft);
    setTestResult(null);
    setEditingId(null);
  }

  function updateDraft(nextDraft: MailSourceDraft) {
    setDraft(nextDraft);
    setTestResult(null);
  }

  function openNew() {
    resetDraft();
    setModalOpen(true);
  }

  function openEdit(source: PublicMailboxSource) {
    setDraft(mailSourceToDraft(source));
    setTestResult(null);
    setEditingId(source.id);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    resetDraft();
  }

  async function testDraft() {
    const editing = Boolean(editingId);
    const payload = mailSourcePayload(draft, editing);
    setPending("test");
    setError(null);
    setTestResult(null);
    try {
      const response = await fetch("/api/mail-sources/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => ({}))) as {
        test?: MailSourceConnectionTestResult;
        error?: string;
      };
      if (!result.test) {
        const message = formatSettingsActionError(result.error, `Mail source test returned ${response.status}`);
        setError(message);
        notifications.show({ color: "red", title: "Connection test failed", message });
        return;
      }
      setTestResult(result.test);
      notifications.show({
        color: result.test.ok ? "green" : "yellow",
        title: result.test.ok ? "Connection ready" : "Connection test failed",
        message: formatMailSourceTestStatus(result.test),
      });
    } finally {
      setPending(null);
    }
  }

  async function save() {
    const editing = Boolean(editingId);
    const payload = mailSourcePayload(draft, editing);
    if (!testResult?.ok) {
      notifications.show({
        color: "yellow",
        title: "Test connection first",
        message: "Save is blocked until the connection test passes.",
      });
      return;
    }
    setPending(editing ? editingId : "new");
    setError(null);
    try {
      const response = await fetch("/api/mail-sources", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...payload, connectionTestPassed: true }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        const message = formatSettingsActionError(result.error, `Mail source save returned ${response.status}`);
        setError(message);
        notifications.show({ color: "red", title: editing ? "Mail source update failed" : "Mail source create failed", message });
        return;
      }
      await loadSettings();
      closeModal();
    } finally {
      setPending(null);
    }
  }

  async function toggle(id: string, isActive: boolean) {
    setPending(id);
    setError(null);
    try {
      const response = await fetch("/api/mail-sources", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, isActive }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        const message = formatSettingsActionError(result.error, `Mail source update returned ${response.status}`);
        setError(message);
        notifications.show({ color: "red", title: "Mail source update failed", message });
        return;
      }
      await loadSettings();
    } finally {
      setPending(null);
    }
  }

  return { draft, testResult, editingId, pending, modalOpen, updateDraft, openNew, openEdit, closeModal, testDraft, save, toggle };
}
