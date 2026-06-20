import { Alert, Badge, Button, Card, Divider, Group, Modal, NumberInput, PasswordInput, Select, Stack, Switch, Table, Text, TextInput, Tooltip } from "@mantine/core";
import { Plus, Save } from "lucide-react";
import type { SettingsResponse } from "@/lib/settings/descriptors";
import { getMailProviderDescriptor } from "@/lib/ingest/mail-provider-registry";
import type { MailProvider, PublicMailboxSource } from "@/lib/ingest/mail-source";
import type { AttachmentStorageBackend } from "@/lib/storage/attachment-storage";
import type { MailSourceDraft, MailSourceTestState } from "./settings-types";
import { attachmentStorageBackendOptions, gmailReadonlyScope, mailProviderOptions, plannedMailProviderOptions } from "./settings-options";
import { ResponsiveGrid, SignalFact } from "./settings-layout";
import { applyMailProviderPreset, formatMailAuthType, formatMailCredentialType, formatMailProvider, formatMailSourceStorageTarget, formatMailSourceTestStatus, formatStorageBackend, unitStatusColor } from "./settings-utils";

export function MailSourcesCard({
  settings,
  draft,
  testResult,
  editingId,
  pending,
  modalOpen,
  onDraftChange,
  onAdd,
  onEdit,
  onModalClose,
  onTest,
  onSave,
  onCancel,
  onToggle,
}: {
  settings: SettingsResponse;
  draft: MailSourceDraft;
  testResult: MailSourceTestState;
  editingId: string | null;
  pending: string | null;
  modalOpen: boolean;
  onDraftChange: (draft: MailSourceDraft) => void;
  onAdd: () => void;
  onEdit: (source: PublicMailboxSource) => void;
  onModalClose: () => void;
  onTest: () => void;
  onSave: () => void;
  onCancel: () => void;
  onToggle: (id: string, isActive: boolean) => void;
}) {
  const sources = settings.mailSources;
  const runnableCount = sources.filter((source) => source.provider === "gmail" && source.isActive && source.credentialConfigured).length;
  const provider = getMailProviderDescriptor(draft.provider);
  const providerImplemented = provider.implemented;
  const testReady = Boolean(testResult?.ok);
  return (
    <Card>
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <Group gap="xs">
            <Text fw={700}>Mail Sources</Text>
            <Badge color={unitStatusColor(settings.units.mail.status)} variant="light">
              {settings.units.mail.status}
            </Badge>
          </Group>
          <Button size="xs" leftSection={<Plus size={14} aria-hidden="true" />} onClick={onAdd}>
            Add source
          </Button>
        </Group>
        <ResponsiveGrid minWidth={220} gap="xs">
          <SignalFact label="Active sources" value={String(sources.filter((source) => source.isActive).length)} />
          <SignalFact label="Runnable ingest" value={String(runnableCount)} />
          <SignalFact label="Credentials" value={sources.some((source) => source.credentialConfigured) ? "configured" : "not configured"} />
        </ResponsiveGrid>

        {sources.length === 0 ? (
          <Alert color="red" title="No mail sources configured" />
        ) : (
          <Table.ScrollContainer minWidth={840}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Mailbox</Table.Th>
                  <Table.Th>Provider</Table.Th>
                  <Table.Th>Auth</Table.Th>
                  <Table.Th>Credential</Table.Th>
                  <Table.Th>Query</Table.Th>
                  <Table.Th>Storage</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {sources.map((source) => (
                  <Table.Tr key={source.id}>
                    <Table.Td>
                      <Text fw={600}>{source.displayName ?? source.mailboxAddress}</Text>
                      <Text size="xs" c="dimmed">{source.mailboxAddress}</Text>
                    </Table.Td>
                    <Table.Td>{formatMailProvider(source.provider)}</Table.Td>
                    <Table.Td>{formatMailAuthType(source.authType)}</Table.Td>
                    <Table.Td>
                      <Badge color={source.credentialConfigured ? "green" : "red"} variant="light" size="xs">
                        {source.credentialConfigured ? "configured" : "missing"}
                      </Badge>
                    </Table.Td>
                    <Table.Td maw={260}>
                      <Text size="sm" lineClamp={2}>{source.query}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{formatStorageBackend(source.storageBackend)}</Text>
                      <Text size="xs" c="dimmed" lineClamp={1}>{formatMailSourceStorageTarget(source)}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={source.isActive ? "green" : "gray"} variant="light" size="xs">
                        {source.isActive ? "active" : "inactive"}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs" wrap="nowrap">
                        <Tooltip label={source.isActive ? "Disable source" : "Enable source"}>
                          <Switch
                            aria-label={`${source.name} active`}
                            checked={source.isActive}
                            disabled={pending === source.id}
                            onChange={(event) => onToggle(source.id, event.currentTarget.checked)}
                          />
                        </Tooltip>
                        <Button size="xs" variant="light" onClick={() => onEdit(source)}>
                          Edit
                        </Button>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}

        <Text size="sm" c="dimmed">{settings.units.mail.detail}</Text>
        <Modal opened={modalOpen} onClose={onModalClose} title={editingId ? "Edit mail source" : "Add mail source"} size="lg" transitionProps={{ duration: 0 }}>
          <Stack gap="md">
            <Stack gap="xs">
              <Text fw={700}>Provider</Text>
              <ResponsiveGrid minWidth={240} gap="sm">
                <Select
                  label="Provider adapter"
                  description="Only implemented providers can be selected."
                  value={draft.provider}
                  data={mailProviderOptions}
                  allowDeselect={false}
                  onChange={(value) => value && onDraftChange(applyMailProviderPreset(draft, value as MailProvider))}
                />
                <TextInput
                  label="Source name"
                  placeholder="Primary supplier inbox"
                  value={draft.name}
                  onChange={(event) => onDraftChange({ ...draft, name: event.currentTarget.value })}
                />
                <Switch
                  label="Active"
                  checked={draft.isActive}
                  onChange={(event) => onDraftChange({ ...draft, isActive: event.currentTarget.checked })}
                />
              </ResponsiveGrid>
              <Group gap="xs">
                <Text size="xs" c="dimmed">Planned</Text>
                {plannedMailProviderOptions.map((provider) => (
                  <Badge key={provider} color="gray" variant="light" size="xs">
                    {provider}
                  </Badge>
                ))}
              </Group>
              {!providerImplemented ? (
                <Alert color="yellow" title="Adapter pending">
                  This provider is planned and cannot be saved yet.
                </Alert>
              ) : null}
            </Stack>

            <Divider />

            <Stack gap="xs">
              <Text fw={700}>Connection</Text>
              <ResponsiveGrid minWidth={240} gap="sm">
                <TextInput
                  label="Mailbox address"
                  description="Delegated inbox that receives supplier catalog emails."
                  placeholder="catalogs@example.com"
                  value={draft.mailboxAddress}
                  onChange={(event) => onDraftChange({ ...draft, mailboxAddress: event.currentTarget.value })}
                />
                <TextInput
                  label="Display name"
                  placeholder="Wholesale inbox"
                  value={draft.displayName}
                  onChange={(event) => onDraftChange({ ...draft, displayName: event.currentTarget.value })}
                />
                <TextInput
                  label="Auth type"
                  value={formatMailAuthType(draft.authType)}
                  readOnly
                />
                <TextInput
                  label="Credential type"
                  value={formatMailCredentialType(draft.credentialType)}
                  readOnly
                />
                <TextInput
                  label="Read-only scope"
                  value={draft.provider === "gmail" ? gmailReadonlyScope : "Provider default"}
                  readOnly
                />
              </ResponsiveGrid>
              <PasswordInput
                label={editingId ? "New credential secret" : "Credential secret"}
                description={draft.provider === "gmail" ? "Paste the Google service account JSON." : undefined}
                placeholder={editingId ? "Leave blank to keep configured" : "Paste credential value"}
                value={draft.credentialSecret}
                onChange={(event) => onDraftChange({ ...draft, credentialSecret: event.currentTarget.value })}
              />
              {draft.provider === "gmail" ? (
                <Text size="xs" c="dimmed">
                  Gmail access uses a fixed read-only scope.
                </Text>
              ) : null}
            </Stack>

            <Divider />

            <Stack gap="xs">
              <Text fw={700}>Ingest</Text>
              <ResponsiveGrid minWidth={240} gap="sm">
                <TextInput
                  label="Query"
                  placeholder="filename:xlsx newer_than:7d"
                  value={draft.query}
                  onChange={(event) => onDraftChange({ ...draft, query: event.currentTarget.value })}
                />
                <TextInput
                  label="Attachment pattern"
                  placeholder=".xlsx"
                  value={draft.attachmentPattern}
                  onChange={(event) => onDraftChange({ ...draft, attachmentPattern: event.currentTarget.value })}
                />
                <NumberInput
                  label="Max results"
                  value={draft.maxResults}
                  allowDecimal={false}
                  min={1}
                  max={500}
                  onChange={(value) => onDraftChange({ ...draft, maxResults: typeof value === "number" ? value : 25 })}
                />
                <NumberInput
                  label="Lookback days"
                  value={Math.max(1, Math.round(draft.lookbackMs / 86400000))}
                  allowDecimal={false}
                  min={1}
                  onChange={(value) => onDraftChange({ ...draft, lookbackMs: (typeof value === "number" ? value : 7) * 86400000 })}
                />
                <TextInput
                  label="Supplier code"
                  placeholder="juno"
                  value={draft.supplierCode}
                  onChange={(event) => onDraftChange({ ...draft, supplierCode: event.currentTarget.value })}
                />
              </ResponsiveGrid>
            </Stack>

            <Divider />

            <Stack gap="xs">
              <Text fw={700}>Attachment Storage</Text>
              <ResponsiveGrid minWidth={240} gap="sm">
                <Select
                  label="Backend"
                  value={draft.storageBackend}
                  data={attachmentStorageBackendOptions}
                  allowDeselect={false}
                  onChange={(value) => value && onDraftChange({ ...draft, storageBackend: value as AttachmentStorageBackend })}
                />
                {draft.storageBackend === "local_drive" ? (
                  <TextInput
                    label="Local path"
                    placeholder=".data/mail-attachments"
                    value={draft.storageDir}
                    onChange={(event) => onDraftChange({ ...draft, storageDir: event.currentTarget.value })}
                  />
                ) : (
                  <>
                    <TextInput
                      label="Endpoint"
                      placeholder="http://localhost:29100"
                      value={draft.storageEndpoint}
                      onChange={(event) => onDraftChange({ ...draft, storageEndpoint: event.currentTarget.value })}
                    />
                    <TextInput
                      label="Bucket"
                      placeholder="juno-wholesale-ops"
                      value={draft.storageBucket}
                      onChange={(event) => onDraftChange({ ...draft, storageBucket: event.currentTarget.value })}
                    />
                    <TextInput
                      label="Prefix"
                      placeholder="mail-attachments"
                      value={draft.storagePrefix}
                      onChange={(event) => onDraftChange({ ...draft, storagePrefix: event.currentTarget.value })}
                    />
                    <TextInput
                      label="Region"
                      placeholder="us-east-1"
                      value={draft.storageRegion}
                      onChange={(event) => onDraftChange({ ...draft, storageRegion: event.currentTarget.value })}
                    />
                    <TextInput
                      label="Access key ID"
                      placeholder="minio-access-key"
                      value={draft.storageAccessKeyId}
                      onChange={(event) => onDraftChange({ ...draft, storageAccessKeyId: event.currentTarget.value })}
                    />
                    <PasswordInput
                      label={editingId ? "New secret access key" : "Secret access key"}
                      placeholder={editingId ? "Leave blank to keep configured" : "Paste secret access key"}
                      value={draft.storageSecret}
                      onChange={(event) => onDraftChange({ ...draft, storageSecret: event.currentTarget.value })}
                    />
                    <Switch
                      label="Path-style URLs"
                      checked={draft.storageForcePathStyle}
                      onChange={(event) => onDraftChange({ ...draft, storageForcePathStyle: event.currentTarget.checked })}
                    />
                  </>
                )}
              </ResponsiveGrid>
            </Stack>

            {testResult ? (
              <Alert color={testResult.ok ? "green" : "yellow"} title={testResult.ok ? "Connection ready" : "Connection test failed"}>
                {formatMailSourceTestStatus(testResult)}
              </Alert>
            ) : null}

            <Group justify="space-between">
              <Button variant="light" disabled={!providerImplemented} loading={pending === "test"} onClick={onTest}>
                Test connection
              </Button>
              <Group>
                <Button variant="light" color="gray" onClick={onCancel}>
                  Cancel
                </Button>
                <Button leftSection={<Save size={16} aria-hidden="true" />} disabled={!providerImplemented || !testReady} loading={pending === (editingId ?? "new")} onClick={onSave}>
                  {editingId ? "Save source" : "Create source"}
                </Button>
              </Group>
            </Group>
          </Stack>
        </Modal>
      </Stack>
    </Card>
  );
}
