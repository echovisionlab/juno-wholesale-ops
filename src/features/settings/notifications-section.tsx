import { useEffect } from "react";
import { Alert, Badge, Button, Card, Group, Modal, MultiSelect, NativeSelect, NumberInput, PasswordInput, Stack, Switch, Table, Text, TextInput, Tooltip } from "@mantine/core";
import { Plus, Save, Trash2 } from "lucide-react";
import type { SettingsResponse } from "@/lib/settings/descriptors";
import type { SignalEventType, SignalSeverity } from "@/lib/insights/repository";
import type { NotificationChannel, NotificationChannelType, NotificationRule } from "@/lib/notifications/types";
import type { NotificationChannelDraft, NotificationRuleDraft } from "./settings-types";
import { notificationChannelTypeOptions, notificationSeverityOptions, notificationSignalTypeOptions } from "./settings-options";
import { ResponsiveGrid, SignalFact } from "./settings-layout";
import { formatNotificationChannelType, formatSignalType, unitStatusColor } from "./settings-utils";

export function NotificationsSettingsCard({
  settings,
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
  onRefresh,
  onChannelDraftChange,
  onRuleDraftChange,
  onAddChannel,
  onEditChannel,
  onCloseChannelModal,
  onSaveChannel,
  onDeleteChannel,
  onToggleChannel,
  onAddRule,
  onEditRule,
  onCloseRuleModal,
  onSaveRule,
  onDeleteRule,
  onToggleRule,
}: {
  settings: SettingsResponse;
  channels: NotificationChannel[] | null;
  rules: NotificationRule[] | null;
  loading: boolean;
  pending: string | null;
  channelDraft: NotificationChannelDraft;
  ruleDraft: NotificationRuleDraft;
  editingChannelId: string | null;
  editingRuleId: string | null;
  channelModalOpen: boolean;
  ruleModalOpen: boolean;
  onRefresh: () => void;
  onChannelDraftChange: (draft: NotificationChannelDraft) => void;
  onRuleDraftChange: (draft: NotificationRuleDraft) => void;
  onAddChannel: () => void;
  onEditChannel: (channel: NotificationChannel) => void;
  onCloseChannelModal: () => void;
  onSaveChannel: () => void;
  onDeleteChannel: (id: string) => void;
  onToggleChannel: (id: string, enabled: boolean) => void;
  onAddRule: () => void;
  onEditRule: (rule: NotificationRule) => void;
  onCloseRuleModal: () => void;
  onSaveRule: () => void;
  onDeleteRule: (id: string) => void;
  onToggleRule: (id: string, enabled: boolean) => void;
}) {
  useEffect(() => {
    if (!channels && !rules && !loading) {
      onRefresh();
    }
  }, [channels, loading, onRefresh, rules]);

  const safeChannels = channels ?? [];
  const safeRules = rules ?? [];

  return (
    <Card>
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <Group gap="xs">
            <Text fw={700}>Notifications</Text>
            <Badge color={unitStatusColor(settings.units.notifications.status)} variant="light">
              {settings.units.notifications.status}
            </Badge>
          </Group>
          <Group gap="xs">
            <Button size="xs" variant="light" loading={loading} onClick={onRefresh}>
              Refresh
            </Button>
            <Button size="xs" leftSection={<Plus size={14} aria-hidden="true" />} onClick={onAddChannel}>
              Add channel
            </Button>
            <Button size="xs" leftSection={<Plus size={14} aria-hidden="true" />} disabled={safeChannels.length === 0} onClick={onAddRule}>
              Add rule
            </Button>
          </Group>
        </Group>

        <ResponsiveGrid minWidth={220} gap="xs">
          <SignalFact label="Channels" value={loading && !channels ? "loading" : String(safeChannels.length)} />
          <SignalFact label="Enabled rules" value={loading && !rules ? "loading" : String(safeRules.filter((rule) => rule.enabled).length)} />
          <SignalFact label="Dispatch" value="dry-run default" />
        </ResponsiveGrid>

        <Stack gap={4}>
          <Text size="sm" fw={700}>Flow</Text>
          <Text size="sm" c="dimmed">
            Add a channel, then add a rule that filters observed signals. Dispatch stays dry-run unless explicitly sent.
          </Text>
        </Stack>

        <Text size="sm" c="dimmed">{settings.units.notifications.detail}</Text>

        <Stack gap="sm">
          <Group justify="space-between">
            <Text fw={700}>Notification Channels</Text>
          </Group>
          {safeChannels.length === 0 ? (
            <Alert color={loading ? "blue" : "yellow"} title={loading ? "Loading channels" : "No notification channels configured"}>
              Create an in-app, logging, or webhook destination before adding rules.
            </Alert>
          ) : (
            <Table.ScrollContainer minWidth={720}>
              <Table verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Channel</Table.Th>
                    <Table.Th>Type</Table.Th>
                    <Table.Th>Config</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {safeChannels.map((channel) => (
                    <Table.Tr key={channel.id}>
                      <Table.Td>
                        <Text fw={700}>{channel.name}</Text>
                        <Text size="xs" c="dimmed">{channel.secretRef ? "secret ref configured" : "no secret ref"}</Text>
                      </Table.Td>
                      <Table.Td>{formatNotificationChannelType(channel.type)}</Table.Td>
                      <Table.Td>{channel.configSummary}</Table.Td>
                      <Table.Td>
                        <Badge color={channel.enabled ? "green" : "gray"} variant="light" size="xs">
                          {channel.enabled ? "enabled" : "disabled"}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs" wrap="nowrap">
                          <Tooltip label={channel.enabled ? "Disable channel" : "Enable channel"}>
                            <Switch
                              aria-label={`${channel.name} channel enabled`}
                              checked={channel.enabled}
                              disabled={pending === channel.id}
                              onChange={(event) => onToggleChannel(channel.id, event.currentTarget.checked)}
                            />
                          </Tooltip>
                          <Button size="xs" variant="light" onClick={() => onEditChannel(channel)}>
                            Edit
                          </Button>
                          <Button
                            size="xs"
                            color="red"
                            variant="light"
                            leftSection={<Trash2 size={14} aria-hidden="true" />}
                            loading={pending === channel.id}
                            onClick={() => onDeleteChannel(channel.id)}
                          >
                            Delete
                          </Button>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
        </Stack>

        <Stack gap="sm">
          <Text fw={700}>Notification Rules</Text>
          {safeRules.length === 0 ? (
            <Alert color={loading ? "blue" : "yellow"} title={loading ? "Loading rules" : "No notification rules configured"}>
              Rules choose which observed signals queue alerts for a channel.
            </Alert>
          ) : (
            <Table.ScrollContainer minWidth={840}>
              <Table verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Rule</Table.Th>
                    <Table.Th>Channel</Table.Th>
                    <Table.Th>Signals</Table.Th>
                    <Table.Th>Severities</Table.Th>
                    <Table.Th>Threshold</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {safeRules.map((rule) => (
                    <Table.Tr key={rule.id}>
                      <Table.Td>
                        <Text fw={700}>{rule.name}</Text>
                        <Text size="xs" c="dimmed">{rule.includeDigest ? "includes digest" : "signals only"}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text>{rule.channelName}</Text>
                        <Text size="xs" c="dimmed">{formatNotificationChannelType(rule.channelType)}</Text>
                      </Table.Td>
                      <Table.Td>{rule.signalTypes.length > 0 ? rule.signalTypes.map(formatSignalType).join(", ") : "All"}</Table.Td>
                      <Table.Td>{rule.severities.length > 0 ? rule.severities.join(", ") : "All"}</Table.Td>
                      <Table.Td>{`score ${rule.minScore}, ${rule.cooldownMinutes} min`}</Table.Td>
                      <Table.Td>
                        <Badge color={rule.enabled ? "green" : "gray"} variant="light" size="xs">
                          {rule.enabled ? "enabled" : "disabled"}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs" wrap="nowrap">
                          <Tooltip label={rule.enabled ? "Disable rule" : "Enable rule"}>
                            <Switch
                              aria-label={`${rule.name} rule enabled`}
                              checked={rule.enabled}
                              disabled={pending === rule.id}
                              onChange={(event) => onToggleRule(rule.id, event.currentTarget.checked)}
                            />
                          </Tooltip>
                          <Button size="xs" variant="light" onClick={() => onEditRule(rule)}>
                            Edit
                          </Button>
                          <Button
                            size="xs"
                            color="red"
                            variant="light"
                            leftSection={<Trash2 size={14} aria-hidden="true" />}
                            loading={pending === rule.id}
                            onClick={() => onDeleteRule(rule.id)}
                          >
                            Delete
                          </Button>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
        </Stack>

        <Modal opened={channelModalOpen} onClose={onCloseChannelModal} title={editingChannelId ? "Edit notification channel" : "Add notification channel"} size="lg" transitionProps={{ duration: 0 }}>
          <Stack gap="sm">
            <ResponsiveGrid minWidth={240} gap="sm">
              <TextInput
                label="Channel name"
                placeholder="Ops in-app"
                value={channelDraft.name}
                onChange={(event) => onChannelDraftChange({ ...channelDraft, name: event.currentTarget.value })}
              />
              <NativeSelect
                label="Channel type"
                value={channelDraft.type}
                data={notificationChannelTypeOptions}
                onChange={(event) => onChannelDraftChange({ ...channelDraft, type: event.currentTarget.value as NotificationChannelType })}
              />
              <Switch
                label="Enabled"
                checked={channelDraft.enabled}
                onChange={(event) => onChannelDraftChange({ ...channelDraft, enabled: event.currentTarget.checked })}
              />
            </ResponsiveGrid>
            {channelDraft.type === "webhook" ? (
              <PasswordInput
                label={editingChannelId ? "New webhook URL" : "Webhook URL"}
                placeholder={editingChannelId ? "Leave blank to keep configured" : "https://example.test/ops-webhook"}
                value={channelDraft.webhookUrl}
                onChange={(event) => onChannelDraftChange({ ...channelDraft, webhookUrl: event.currentTarget.value })}
              />
            ) : null}
            <TextInput
              label="Secret ref"
              placeholder="NOTIFICATION_WEBHOOK_URL"
              value={channelDraft.secretRef}
              onChange={(event) => onChannelDraftChange({ ...channelDraft, secretRef: event.currentTarget.value })}
            />
            <Group justify="flex-end">
              <Button variant="light" color="gray" onClick={onCloseChannelModal}>
                Cancel
              </Button>
              <Button leftSection={<Save size={16} aria-hidden="true" />} loading={pending === (editingChannelId ?? "channel-new")} onClick={onSaveChannel}>
                {editingChannelId ? "Save channel" : "Create channel"}
              </Button>
            </Group>
          </Stack>
        </Modal>

        <Modal opened={ruleModalOpen} onClose={onCloseRuleModal} title={editingRuleId ? "Edit notification rule" : "Add notification rule"} size="lg" transitionProps={{ duration: 0 }}>
          <Stack gap="sm">
            <ResponsiveGrid minWidth={240} gap="sm">
              <TextInput
                label="Rule name"
                placeholder="Watch hits to in-app"
                value={ruleDraft.name}
                onChange={(event) => onRuleDraftChange({ ...ruleDraft, name: event.currentTarget.value })}
              />
              <NativeSelect
                label="Channel"
                value={ruleDraft.channelId}
                data={safeChannels.map((channel) => ({ value: channel.id, label: channel.name }))}
                onChange={(event) => onRuleDraftChange({ ...ruleDraft, channelId: event.currentTarget.value })}
              />
              <NumberInput
                label="Min score"
                description="0 includes all scores."
                value={ruleDraft.minScore}
                allowDecimal={false}
                min={-100}
                max={100}
                onChange={(value) => onRuleDraftChange({ ...ruleDraft, minScore: typeof value === "number" ? value : 0 })}
              />
              <NumberInput
                label="Cooldown minutes"
                description="Suppress repeated deliveries."
                value={ruleDraft.cooldownMinutes}
                allowDecimal={false}
                min={0}
                onChange={(value) => onRuleDraftChange({ ...ruleDraft, cooldownMinutes: typeof value === "number" ? value : 60 })}
              />
              <Switch
                label="Enabled"
                checked={ruleDraft.enabled}
                onChange={(event) => onRuleDraftChange({ ...ruleDraft, enabled: event.currentTarget.checked })}
              />
              <Switch
                label="Include watch hits"
                checked={ruleDraft.includeWatchHits}
                onChange={(event) => onRuleDraftChange({ ...ruleDraft, includeWatchHits: event.currentTarget.checked })}
              />
              <Switch
                label="Include digest"
                checked={ruleDraft.includeDigest}
                onChange={(event) => onRuleDraftChange({ ...ruleDraft, includeDigest: event.currentTarget.checked })}
              />
            </ResponsiveGrid>
            <MultiSelect
              label="Signal types"
              placeholder="All observed signals"
              data={notificationSignalTypeOptions}
              value={ruleDraft.signalTypes}
              onChange={(values) => onRuleDraftChange({ ...ruleDraft, signalTypes: values as SignalEventType[] })}
            />
            <MultiSelect
              label="Severities"
              placeholder="All severities"
              data={notificationSeverityOptions}
              value={ruleDraft.severities}
              onChange={(values) => onRuleDraftChange({ ...ruleDraft, severities: values as SignalSeverity[] })}
            />
            <Group justify="flex-end">
              <Button variant="light" color="gray" onClick={onCloseRuleModal}>
                Cancel
              </Button>
              <Button leftSection={<Save size={16} aria-hidden="true" />} loading={pending === (editingRuleId ?? "rule-new")} onClick={onSaveRule}>
                {editingRuleId ? "Save rule" : "Create rule"}
              </Button>
            </Group>
          </Stack>
        </Modal>
      </Stack>
    </Card>
  );
}
