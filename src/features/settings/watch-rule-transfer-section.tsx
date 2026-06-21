"use client";

import { useRef, useState, type ChangeEvent, type Dispatch, type SetStateAction } from "react";
import { Alert, Button, Card, Group, Stack, Table, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { Check, Download, Eye, FileJson, Upload } from "lucide-react";
import type {
  WatchRuleExportPayload,
  WatchRuleImportItem,
  WatchRuleImportResult,
} from "@/lib/insights/watch-rule-transfer";

type WatchRuleTransferCardProps = {
  setError: Dispatch<SetStateAction<string | null>>;
};

type ImportPreview = {
  payloadText: string;
  result: WatchRuleImportResult;
};

type PendingAction = "export" | "preview" | "apply";

export function WatchRuleTransferCard({ setError }: WatchRuleTransferCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [payloadText, setPayloadText] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);

  const hasSelectedFile = payloadText.trim().length > 0;
  const previewMatchesFile = Boolean(preview && preview.payloadText === payloadText);
  const canApply = previewMatchesFile && preview !== null && preview.result.dryRun && preview.result.invalid === 0 && pending === null;

  async function exportRules() {
    setPending("export");
    setError(null);
    try {
      const response = await fetch("/api/watch-rules/export", { method: "GET" });
      const body = await readApiJson<{ payload?: WatchRuleExportPayload }>(response);
      if (!body.payload) {
        throw new Error("Export response did not include a payload.");
      }
      downloadJson(body.payload);
      notifications.show({
        color: "green",
        title: "Watch rules exported",
        message: `${body.payload.rules.length} rule${body.payload.rules.length === 1 ? "" : "s"}`,
      });
    } catch (error) {
      reportFailure("Export failed", error, setError);
    } finally {
      setPending(null);
    }
  }

  async function previewImport() {
    setPending("preview");
    setError(null);
    setPreview(null);
    try {
      const requestBody = buildImportRequestBody(payloadText, true);
      const response = await fetch("/api/watch-rules/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const body = await readApiJson<{ result?: WatchRuleImportResult }>(response);
      if (!body.result) {
        throw new Error("Import preview response did not include a result.");
      }
      setPreview({ payloadText, result: body.result });
      notifications.show({ color: "green", title: "Import preview ready", message: importSummary(body.result) });
    } catch (error) {
      reportFailure("Import preview failed", error, setError);
    } finally {
      setPending(null);
    }
  }

  async function applyImport() {
    if (!canApply) {
      return;
    }

    setPending("apply");
    setError(null);
    try {
      const requestBody = buildImportRequestBody(payloadText, false);
      const response = await fetch("/api/watch-rules/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const body = await readApiJson<{ result?: WatchRuleImportResult }>(response);
      if (!body.result) {
        throw new Error("Import response did not include a result.");
      }
      setPreview({ payloadText, result: body.result });
      notifications.show({ color: "green", title: "Watch rules imported", message: importSummary(body.result) });
    } catch (error) {
      reportFailure("Import failed", error, setError);
    } finally {
      setPending(null);
    }
  }

  async function selectImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    setError(null);
    setPreview(null);
    setSelectedFileName(file?.name ?? "");
    setPayloadText("");
    if (!file) {
      return;
    }

    try {
      setPayloadText(await file.text());
    } catch (error) {
      reportFailure("File read failed", error, setError);
    }
  }

  function openFilePicker() {
    if (!fileInputRef.current) {
      return;
    }
    fileInputRef.current.value = "";
    fileInputRef.current.click();
  }

  return (
    <Card>
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <Stack gap={4}>
            <Text fw={700}>Watch Rule Transfer</Text>
            <Text size="sm" c="dimmed">
              Export rules, preview a JSON import, then apply the previewed file.
            </Text>
          </Stack>
          <Button
            variant="light"
            leftSection={<Download size={16} aria-hidden="true" />}
            loading={pending === "export"}
            onClick={() => void exportRules()}
          >
            Export JSON
          </Button>
        </Group>

        <Group gap="sm" align="center">
          <Button
            type="button"
            variant="light"
            leftSection={<Upload size={16} aria-hidden="true" />}
            onClick={openFilePicker}
          >
            Select JSON
          </Button>
          <input
            ref={fileInputRef}
            aria-label="Watch rule import file"
            accept=".json,application/json"
            type="file"
            onChange={(event) => void selectImportFile(event)}
            style={{ display: "none" }}
          />
          <Text size="sm" c={selectedFileName ? "gray.8" : "dimmed"}>
            {selectedFileName || "No file selected"}
          </Text>
        </Group>

        <Group gap="sm">
          <Button
            variant="light"
            leftSection={<Eye size={16} aria-hidden="true" />}
            disabled={!hasSelectedFile || pending !== null}
            loading={pending === "preview"}
            onClick={() => void previewImport()}
          >
            Preview import
          </Button>
          <Button
            leftSection={<Check size={16} aria-hidden="true" />}
            disabled={!canApply}
            loading={pending === "apply"}
            onClick={() => void applyImport()}
          >
            Apply import
          </Button>
        </Group>

        {preview && !previewMatchesFile ? (
          <Alert color="yellow" icon={<FileJson size={18} aria-hidden="true" />} title="Preview changed">
            Preview the selected file again before applying it.
          </Alert>
        ) : null}

        <ImportResultTable preview={preview} />
      </Stack>
    </Card>
  );
}

function ImportResultTable({ preview }: { preview: ImportPreview | null }) {
  if (!preview) {
    return (
      <Text size="sm" c="dimmed">
        No import preview.
      </Text>
    );
  }

  const result = preview.result;
  return (
    <Stack gap="xs">
      <Text size="sm">{importSummary(result)}</Text>
      {result.invalid > 0 ? (
        <Text size="sm" c="red.7">
          Resolve invalid rows before applying.
        </Text>
      ) : null}
      <Table.ScrollContainer minWidth={860}>
        <Table verticalSpacing="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>#</Table.Th>
              <Table.Th>Action</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Type</Table.Th>
              <Table.Th>Pattern</Table.Th>
              <Table.Th>Weight</Table.Th>
              <Table.Th>Enabled</Table.Th>
              <Table.Th>Note</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {result.items.length > 0 ? (
              result.items.map((item) => <ImportResultRow key={item.index} item={item} />)
            ) : (
              <Table.Tr>
                <Table.Td colSpan={8}>No rows.</Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Stack>
  );
}

function ImportResultRow({ item }: { item: WatchRuleImportItem }) {
  return (
    <Table.Tr>
      <Table.Td>{item.index + 1}</Table.Td>
      <Table.Td>{item.action}</Table.Td>
      <Table.Td>{item.status}</Table.Td>
      <Table.Td>{item.rule?.type ?? "-"}</Table.Td>
      <Table.Td>{item.rule?.pattern ?? "-"}</Table.Td>
      <Table.Td>{item.rule?.weight ?? "-"}</Table.Td>
      <Table.Td>{item.rule ? (item.rule.enabled ? "Yes" : "No") : "-"}</Table.Td>
      <Table.Td>{item.reason ?? item.existingRuleId ?? "-"}</Table.Td>
    </Table.Tr>
  );
}

function buildImportRequestBody(payloadText: string, dryRun: boolean): unknown {
  const parsed = JSON.parse(payloadText) as unknown;
  if (Array.isArray(parsed)) {
    return { rules: parsed, dryRun };
  }
  if (parsed && typeof parsed === "object") {
    return { ...(parsed as Record<string, unknown>), dryRun };
  }
  throw new Error("Import file must contain a JSON object or array.");
}

async function readApiJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(apiErrorMessage(body, response.status));
  }
  return body as T;
}

function apiErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
    return body.error;
  }
  return `Request failed (${status})`;
}

function reportFailure(title: string, error: unknown, setError: Dispatch<SetStateAction<string | null>>) {
  const message = error instanceof Error ? error.message : title;
  setError(message);
  notifications.show({ color: "red", title, message });
}

function importSummary(result: WatchRuleImportResult): string {
  return `${result.total} row${result.total === 1 ? "" : "s"}: ${result.created} create, ${result.updated} update, ${result.skipped} skip.`;
}

function downloadJson(payload: WatchRuleExportPayload) {
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `watch-rules-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
