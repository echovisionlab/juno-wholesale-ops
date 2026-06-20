"use client";

import { useMemo } from "react";
import { Alert, Box, Button, Card, Container, Group, Stack, Tabs, Text, Title } from "@mantine/core";
import { AlertTriangle } from "lucide-react";
import type { SettingsGroup, SettingsGroupId, SettingsResponse } from "@/lib/settings/descriptors";
import type { NotificationChannel, NotificationRule } from "@/lib/notifications/types";
import { AuthAccessCards, AuthProviderCard } from "./auth-section";
import { JunoLiveSessionCard } from "./juno-live-section";
import { MailSourcesCard } from "./mail-sources-section";
import { NotificationsSettingsCard } from "./notifications-section";
import {
  useJunoLiveController,
  useMailSourcesController,
  useNotificationSettingsController,
  useSettingsResource,
  useSsoProviderController,
} from "./settings-controllers";
import { OverviewAttentionPanel, SettingsGroupCard, SettingsWarningsPanel, SystemStatusStrip } from "./settings-layout";
import type { SettingsTab } from "./settings-types";

export { formatJunoSessionCheckStatus, formatMailSourceTestStatus, formatSettingsActionError } from "./settings-utils";

type SettingsCenterProps = {
  initialSettings?: SettingsResponse | null;
  initialError?: string | null;
  initialTab?: SettingsTab;
  initialNotificationChannels?: NotificationChannel[] | null;
  initialNotificationRules?: NotificationRule[] | null;
};


export function SettingsCenter({
  initialSettings = null,
  initialError = null,
  initialTab = "overview",
  initialNotificationChannels = null,
  initialNotificationRules = null,
}: SettingsCenterProps) {
  const { settings, setSettings, draft, setDraft, error, setError, savingGroup, loadSettings, saveGroup } = useSettingsResource({
    initialSettings,
    initialError,
  });
  const junoLive = useJunoLiveController({ setSettings, setError });
  const mailSources = useMailSourcesController({ loadSettings, setError });
  const ssoProviders = useSsoProviderController({ setSettings, setError });
  const notificationsState = useNotificationSettingsController({
    initialChannels: initialNotificationChannels,
    initialRules: initialNotificationRules,
    setError,
  });

  const groupsById = useMemo(() => {
    return Object.fromEntries((settings?.groups ?? []).map((group) => [group.id, group])) as Partial<Record<SettingsGroupId, SettingsGroup>>;
  }, [settings]);

  return (
    <Box component="main" bg="gray.0" mih="100vh">
      <Container py="xl">
        <Stack gap="lg">
          <Group justify="space-between" align="flex-start">
            <Stack gap={4}>
              <Text size="sm" fw={700} tt="uppercase" c="sage.7">
                Operator setup
              </Text>
              <Title order={1}>Settings Center</Title>
              <Text c="dimmed">Operator settings.</Text>
            </Stack>
            <Button component="a" href="/" variant="light">
              Dashboard
            </Button>
          </Group>

          {error ? (
            <Alert color="red" icon={<AlertTriangle size={18} aria-hidden="true" />} title="Settings action failed">
              {error}
            </Alert>
          ) : null}

          {!settings ? (
            <Card>
              <Text fw={700}>{error ? "Settings unavailable" : "Loading settings..."}</Text>
              <Text size="sm" c="dimmed" mt={4}>
                {error ? "Check DATABASE_URL and Postgres." : "Loading settings."}
              </Text>
              {error ? (
                <Button size="xs" variant="light" mt="md" onClick={() => void loadSettings()}>
                  Retry settings load
                </Button>
              ) : null}
            </Card>
          ) : (
            <>
              <SystemStatusStrip settings={settings} />
              <SettingsWarningsPanel warnings={settings.warnings} />
              <Tabs defaultValue={initialTab} keepMounted={false}>
                <Tabs.List>
                  <Tabs.Tab value="overview">Overview</Tabs.Tab>
                  <Tabs.Tab value="auth">Auth</Tabs.Tab>
                  <Tabs.Tab value="mail">Mail Sources</Tabs.Tab>
                  <Tabs.Tab value="juno">Juno Live</Tabs.Tab>
                  <Tabs.Tab value="notifications">Notifications</Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="overview" pt="md">
                  <Stack gap="md">
                    <OverviewAttentionPanel settings={settings} />
                  </Stack>
                </Tabs.Panel>

                {(["auth", "mail", "juno", "notifications"] as const).map((groupId) => (
                  <Tabs.Panel key={groupId} value={groupId} pt="md">
                    {groupsById[groupId] ? (
                      <Stack gap="md">
                        {groupId === "auth" ? (
                          <>
                            <AuthAccessCards settings={settings} />
                            <AuthProviderCard
                              settings={settings}
                              draft={ssoProviders.draft}
                              editingId={ssoProviders.editingId}
                              pending={ssoProviders.pending}
                              onDraftChange={ssoProviders.setDraft}
                              onEdit={ssoProviders.openEdit}
                              onCancel={ssoProviders.closeModal}
                              onSave={() => void ssoProviders.save()}
                              onDelete={(id) => void ssoProviders.deleteProvider(id)}
                              onToggle={(id, enabled) => void ssoProviders.toggle(id, enabled)}
                              modalOpen={ssoProviders.modalOpen}
                              onAdd={ssoProviders.openNew}
                              onModalClose={ssoProviders.closeModal}
                            />
                          </>
                        ) : null}
                        {groupId === "mail" ? (
                          <MailSourcesCard
                            settings={settings}
                            draft={mailSources.draft}
                            testResult={mailSources.testResult}
                            editingId={mailSources.editingId}
                            pending={mailSources.pending}
                            modalOpen={mailSources.modalOpen}
                            onDraftChange={mailSources.updateDraft}
                            onAdd={mailSources.openNew}
                            onEdit={mailSources.openEdit}
                            onModalClose={mailSources.closeModal}
                            onTest={() => void mailSources.testDraft()}
                            onSave={() => void mailSources.save()}
                            onCancel={mailSources.closeModal}
                            onToggle={(id, isActive) => void mailSources.toggle(id, isActive)}
                          />
                        ) : null}
                        {groupId === "juno" ? (
                          <JunoLiveSessionCard
                            settings={settings}
                            group={groupsById[groupId]}
                            pending={junoLive.pending}
                            onTest={() => void junoLive.testSession()}
                          />
                        ) : null}
                        {groupId === "notifications" ? (
                          <NotificationsSettingsCard
                            settings={settings}
                            channels={notificationsState.channels}
                            rules={notificationsState.rules}
                            loading={notificationsState.loading}
                            pending={notificationsState.pending}
                            channelDraft={notificationsState.channelDraft}
                            ruleDraft={notificationsState.ruleDraft}
                            editingChannelId={notificationsState.editingChannelId}
                            editingRuleId={notificationsState.editingRuleId}
                            channelModalOpen={notificationsState.channelModalOpen}
                            ruleModalOpen={notificationsState.ruleModalOpen}
                            onRefresh={() => void notificationsState.loadResources()}
                            onChannelDraftChange={notificationsState.setChannelDraft}
                            onRuleDraftChange={notificationsState.setRuleDraft}
                            onAddChannel={notificationsState.openNewChannel}
                            onEditChannel={notificationsState.openEditChannel}
                            onCloseChannelModal={notificationsState.closeChannelModal}
                            onSaveChannel={() => void notificationsState.saveChannel()}
                            onDeleteChannel={(id) => void notificationsState.deleteChannel(id)}
                            onToggleChannel={(id, enabled) => void notificationsState.toggleChannel(id, enabled)}
                            onAddRule={notificationsState.openNewRule}
                            onEditRule={notificationsState.openEditRule}
                            onCloseRuleModal={notificationsState.closeRuleModal}
                            onSaveRule={() => void notificationsState.saveRule()}
                            onDeleteRule={(id) => void notificationsState.deleteRule(id)}
                            onToggleRule={(id, enabled) => void notificationsState.toggleRule(id, enabled)}
                          />
                        ) : null}
                        {groupsById[groupId].settings.length > 0 ? (
                          <SettingsGroupCard
                            group={groupsById[groupId]}
                            draft={draft}
                            saving={savingGroup === groupId}
                            onDraftChange={(key, value) => setDraft((current) => ({ ...current, [key]: value }))}
                            onSave={() => groupsById[groupId] && void saveGroup(groupsById[groupId])}
                          />
                        ) : null}
                      </Stack>
                    ) : null}
                  </Tabs.Panel>
                ))}
              </Tabs>
            </>
          )}
        </Stack>
      </Container>
    </Box>
  );
}
