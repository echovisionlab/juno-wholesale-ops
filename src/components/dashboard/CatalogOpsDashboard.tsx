"use client";

import { useEffect, useState } from "react";
import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Card,
  Checkbox,
  Code,
  Container,
  Divider,
  Grid,
  Group,
  Menu,
  MultiSelect,
  NativeSelect,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import {
  AlertTriangle,
  Activity,
  BarChart3,
  Bell,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  MailSearch,
  PackageCheck,
  PackageSearch,
  Play,
  Plus,
  RotateCw,
  Send,
  Signal,
  SlidersHorizontal,
  Square,
  Trash2,
  Webhook,
} from "lucide-react";
import { CommandPanel } from "./CommandPanel";
import { PipelineCard } from "./PipelineCard";
import { SectionHeader } from "./SectionHeader";
import { StatCard } from "./StatCard";
import {
  dashboardDateRanges,
  dashboardSignalSeverities,
  dashboardSignalTypes,
  defaultDashboardSignalFilters,
  filterDashboardSignals,
  formatDashboardDateRange,
  hasActiveDashboardSignalFilters,
  type DashboardSignalFilters,
  type DashboardSignalSeverity,
  type DashboardSignalType,
} from "@/lib/dashboard/signal-filters";
import {
  formatNotificationChannelType,
  formatNotificationDeliveryStatus as formatDeliveryStatus,
  formatSignalSeverity as formatSeverity,
  formatSignalType,
  formatWatchRuleType,
  watchRuleTypeOptions,
} from "@/lib/dashboard/presentation";
import {
  dashboardPanelLayoutStorageKey,
  defaultDashboardPanelLayout,
  getVisibleOptionalDashboardPanelIds,
  isDashboardPanelVisible,
  optionalDashboardPanelDefinitions,
  readDashboardPanelLayout,
  setVisibleOptionalDashboardPanels,
  type DashboardPanelId,
  type DashboardPanelLayout,
} from "@/lib/dashboard/panel-layout";
import type {
  AppSetupStatus,
  CatalogTrendSummary,
  DashboardSavedView,
  DashboardSavedViewDraft,
  DashboardResourceIssue,
  GmailIngestState,
  InsightDigest,
  LiveLookupDashboardSummary,
  LiveWorkerAction,
  LiveWorkerStatus,
  MovementSignal,
  NotificationChannel,
  NotificationDelivery,
  NotificationRule,
  PipelineItem,
  SetupGuardrail,
  SetupStep,
  StatCardData,
  TodayInsight,
  TrendBucket,
  WatchRule,
  WatchRuleDraft,
  WatchRuleType,
} from "./types";

export type CatalogOpsDashboardProps = {
  stats: StatCardData[];
  pipeline: PipelineItem[];
  commands: string[];
  ingestState?: GmailIngestState | null;
  liveSummary?: LiveLookupDashboardSummary | null;
  workerStatus?: LiveWorkerStatus | null;
  setupStatus?: AppSetupStatus | null;
  todaySignals?: TodayInsight[] | null;
  movementSignals?: MovementSignal[] | null;
  catalogTrends?: CatalogTrendSummary | null;
  operatorDigest?: InsightDigest | null;
  watchRules?: WatchRule[] | null;
  notificationDeliveries?: NotificationDelivery[] | null;
  notificationRules?: NotificationRule[] | null;
  notificationChannels?: NotificationChannel[] | null;
  apiIssues?: DashboardResourceIssue[];
  workerActionPending?: boolean;
  watchRuleActionPending?: boolean;
  onWorkerAction?: (action: LiveWorkerAction) => void;
  onCreateWatchRule?: (draft: WatchRuleDraft) => void;
  onToggleWatchRule?: (rule: WatchRule) => void;
  onDeleteWatchRule?: (rule: WatchRule) => void;
  dashboardSavedViews?: DashboardSavedView[] | null;
  dashboardSavedViewActionPending?: boolean;
  onCreateDashboardSavedView?: (draft: DashboardSavedViewDraft) => void;
  onUpdateDashboardSavedView?: (view: DashboardSavedView, filters: DashboardSignalFilters) => void;
  onDeleteDashboardSavedView?: (view: DashboardSavedView) => void;
};

export function CatalogOpsDashboard({
  stats,
  pipeline,
  commands,
  ingestState,
  liveSummary,
  workerStatus,
  setupStatus,
  todaySignals,
  movementSignals,
  catalogTrends,
  operatorDigest,
  watchRules,
  notificationDeliveries,
  notificationRules,
  notificationChannels,
  apiIssues = [],
  workerActionPending = false,
  watchRuleActionPending = false,
  onWorkerAction,
  onCreateWatchRule,
  onToggleWatchRule,
  onDeleteWatchRule,
  dashboardSavedViews,
  dashboardSavedViewActionPending = false,
  onCreateDashboardSavedView,
  onUpdateDashboardSavedView,
  onDeleteDashboardSavedView,
}: CatalogOpsDashboardProps) {
  const workerDisabledReason = getLiveWorkerDisabledReason(setupStatus);
  const [signalFilters, setSignalFilters] = useState<DashboardSignalFilters>(defaultDashboardSignalFilters);
  const [panelLayout, setPanelLayout] = useState<DashboardPanelLayout>(defaultDashboardPanelLayout);
  const savedViewList = dashboardSavedViews ?? [];
  const filtersActive = hasActiveDashboardSignalFilters(signalFilters);
  const filteredTodaySignals = todaySignals ? filterDashboardSignals(todaySignals, signalFilters) : todaySignals;
  const filteredMovementSignals = movementSignals ? filterDashboardSignals(movementSignals, signalFilters) : movementSignals;

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      try {
        setPanelLayout(readDashboardPanelLayout(window.localStorage.getItem(dashboardPanelLayoutStorageKey)));
      } catch {
        setPanelLayout(defaultDashboardPanelLayout);
      }
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  function updateVisiblePanels(panelIds: DashboardPanelId[]) {
    const nextLayout = setVisibleOptionalDashboardPanels(panelLayout, panelIds);
    setPanelLayout(nextLayout);
    try {
      window.localStorage.setItem(dashboardPanelLayoutStorageKey, JSON.stringify(nextLayout));
    } catch {
      // Keeping the in-memory choice is still useful when storage is unavailable.
    }
  }

  function panelVisible(panelId: DashboardPanelId): boolean {
    return isDashboardPanelVisible(panelLayout, panelId);
  }

  return (
    <Box component="main" bg="gray.0" mih="100vh">
      <Box component="section" bg="white">
        <Container py="xl">
          <Stack gap="xl">
            <Group justify="space-between" align="flex-start">
              <Box>
                <Text size="sm" fw={700} tt="uppercase" c="sage.7">
                  Juno Wholesale Ops
                </Text>
                <Title order={1} mt={6}>
                  Juno catalog control desk
                </Title>
              </Box>
            </Group>

            <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm">
              {stats.map((stat) => (
                <StatCard key={stat.label} {...stat} />
              ))}
            </SimpleGrid>
          </Stack>
        </Container>
      </Box>

      <Container py="xl">
        <Grid gap="lg">
          <Grid.Col span={12}>
            <Group justify="space-between" align="center">
              <SectionHeader icon={ClipboardCheck}>Configuration</SectionHeader>
              <Group gap="sm" justify="flex-end">
                <DashboardPanelVisibilityControl layout={panelLayout} onChange={updateVisiblePanels} />
                <Button component="a" href="/settings" variant="light" leftSection={<SlidersHorizontal size={16} aria-hidden="true" />}>
                  Open Settings Center
                </Button>
              </Group>
            </Group>
            <SetupChecklist setupStatus={setupStatus} />
          </Grid.Col>

          {apiIssues.length > 0 ? (
            <Grid.Col span={12}>
              <ApiIssuePanel issues={apiIssues} />
            </Grid.Col>
          ) : null}

          {panelVisible("ingestionPipeline") ? (
            <Grid.Col span={{ base: 12, lg: 8 }}>
              <SectionHeader icon={PackageCheck}>Ingestion Pipeline</SectionHeader>
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                {pipeline.map((item) => (
                  <PipelineCard key={item.title} {...item} />
                ))}
              </SimpleGrid>
            </Grid.Col>
          ) : null}

          {panelVisible("commands") ? (
            <Grid.Col span={{ base: 12, lg: 4 }}>
              <CommandPanel commands={commands} />
            </Grid.Col>
          ) : null}

          {panelVisible("mailIngest") ? (
            <Grid.Col span={12}>
              <SectionHeader icon={MailSearch}>Mail Ingest State</SectionHeader>
              <GmailIngestStatusPanel state={ingestState} />
            </Grid.Col>
          ) : null}

          <Grid.Col span={12}>
            <SectionHeader icon={SlidersHorizontal}>Signal Filters</SectionHeader>
            <DashboardSignalFiltersPanel
              filters={signalFilters}
              filtersActive={filtersActive}
              savedViews={savedViewList}
              pending={dashboardSavedViewActionPending}
              onChange={setSignalFilters}
              onCreate={onCreateDashboardSavedView}
              onUpdate={onUpdateDashboardSavedView}
              onDelete={onDeleteDashboardSavedView}
            />
          </Grid.Col>

          {panelVisible("todaySignals") ? (
            <Grid.Col span={{ base: 12, lg: 7 }}>
              <SectionHeader icon={Signal}>Today Signals</SectionHeader>
              <TodaySignalsPanel signals={filteredTodaySignals} filtersActive={filtersActive} />
            </Grid.Col>
          ) : null}

          {panelVisible("watchRules") ? (
            <Grid.Col span={{ base: 12, lg: 5 }}>
              <SectionHeader icon={SlidersHorizontal}>Watch Rules</SectionHeader>
              <WatchRulesPanel
                rules={watchRules}
                pending={watchRuleActionPending}
                onCreate={onCreateWatchRule}
                onToggle={onToggleWatchRule}
                onDelete={onDeleteWatchRule}
              />
            </Grid.Col>
          ) : null}

          {panelVisible("movementSignals") ? (
            <Grid.Col span={{ base: 12, lg: 7 }}>
              <SectionHeader icon={Activity}>Movement Signals</SectionHeader>
              <MovementSignalsPanel signals={filteredMovementSignals} filtersActive={filtersActive} />
            </Grid.Col>
          ) : null}

          {panelVisible("operatorDigest") ? (
            <Grid.Col span={{ base: 12, lg: 5 }}>
              <SectionHeader icon={ClipboardCheck}>Operator Digest</SectionHeader>
              <OperatorDigestPanel digest={operatorDigest} />
            </Grid.Col>
          ) : null}

          {panelVisible("catalogTrends") ? (
            <Grid.Col span={12}>
              <SectionHeader icon={BarChart3}>Catalog Trends</SectionHeader>
              <CatalogTrendsPanel trends={catalogTrends} />
            </Grid.Col>
          ) : null}

          {panelVisible("notificationCenter") ? (
            <Grid.Col span={{ base: 12, lg: 7 }}>
              <SectionHeader icon={Bell}>Notification Center</SectionHeader>
              <NotificationCenterPanel deliveries={notificationDeliveries} />
            </Grid.Col>
          ) : null}

          {panelVisible("notificationRules") ? (
            <Grid.Col span={{ base: 12, lg: 5 }}>
              <SectionHeader icon={Send}>Notification Rules</SectionHeader>
              <NotificationRulesPanel rules={notificationRules} />
            </Grid.Col>
          ) : null}

          {panelVisible("notificationChannels") ? (
            <Grid.Col span={12}>
              <SectionHeader icon={Webhook}>Notification Channels</SectionHeader>
              <NotificationChannelsPanel channels={notificationChannels} />
            </Grid.Col>
          ) : null}

          {panelVisible("liveStockWatch") ? (
            <Grid.Col span={12}>
              <SectionHeader icon={PackageSearch}>Live Stock Watch</SectionHeader>
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm">
                <StatCard
                  label="Queued / Running"
                  value={liveSummary ? `${liveSummary.queued} / ${liveSummary.running}` : "N/A"}
                  detail="browser worker job backlog"
                  icon={Boxes}
                />
                <StatCard
                  label="Succeeded / Failed"
                  value={liveSummary ? `${liveSummary.succeeded} / ${liveSummary.failed}` : "N/A"}
                  detail="completed lookup jobs"
                  icon={CheckCircle2}
                />
                <StatCard
                  label="Blocked / Manual"
                  value={liveSummary ? `${liveSummary.blocked} / ${liveSummary.manualRequired}` : "N/A"}
                  detail="challenge or credential intervention"
                  icon={AlertTriangle}
                />
                <StatCard
                  label="Latest Live Stock"
                  value={liveSummary?.latestDisplayStock ?? "N/A"}
                  detail={formatObservedAt(liveSummary?.latestObservedAt)}
                  icon={PackageSearch}
                />
              </SimpleGrid>
            </Grid.Col>
          ) : null}

          {panelVisible("workerControls") ? (
            <Grid.Col span={12}>
              <WorkerControlPanel
                status={workerStatus}
                pending={workerActionPending}
                disabledReason={workerDisabledReason}
                onAction={onWorkerAction}
              />
            </Grid.Col>
          ) : null}
        </Grid>
      </Container>
    </Box>
  );
}

function DashboardPanelVisibilityControl({
  layout,
  onChange,
}: {
  layout: DashboardPanelLayout;
  onChange: (panelIds: DashboardPanelId[]) => void;
}) {
  const visiblePanelIds = getVisibleOptionalDashboardPanelIds(layout);
  const hiddenCount = optionalDashboardPanelDefinitions.length - visiblePanelIds.length;

  function togglePanel(panelId: DashboardPanelId, checked: boolean) {
    const nextPanelIds = checked
      ? [...visiblePanelIds, panelId]
      : visiblePanelIds.filter((visiblePanelId) => visiblePanelId !== panelId);
    onChange(nextPanelIds);
  }

  return (
    <Menu position="bottom-end" closeOnItemClick={false} withinPortal>
      <Menu.Target>
        <Button variant="default" size="sm" leftSection={<SlidersHorizontal size={16} aria-hidden="true" />}>
          {hiddenCount > 0 ? `Panels (${hiddenCount} hidden)` : "Panels"}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Box p="sm" miw={240} mah={360} style={{ overflowY: "auto" }}>
          <Stack gap="sm">
            <Group justify="space-between" gap="sm">
              <Text size="xs" fw={700} tt="uppercase" c="dimmed">
                Visible panels
              </Text>
              <Button
                size="compact-xs"
                variant="subtle"
                disabled={hiddenCount === 0}
                onClick={() => onChange(optionalDashboardPanelDefinitions.map((definition) => definition.id))}
              >
                Show all
              </Button>
            </Group>
            {optionalDashboardPanelDefinitions.map((definition) => (
              <Checkbox
                key={definition.id}
                size="sm"
                label={definition.label}
                aria-label={definition.label}
                checked={visiblePanelIds.includes(definition.id)}
                onChange={(event) => togglePanel(definition.id, event.currentTarget.checked)}
              />
            ))}
          </Stack>
        </Box>
      </Menu.Dropdown>
    </Menu>
  );
}

function DashboardSignalFiltersPanel({
  filters,
  filtersActive,
  savedViews,
  pending,
  onChange,
  onCreate,
  onUpdate,
  onDelete,
}: {
  filters: DashboardSignalFilters;
  filtersActive: boolean;
  savedViews: DashboardSavedView[];
  pending: boolean;
  onChange: (filters: DashboardSignalFilters) => void;
  onCreate?: (draft: DashboardSavedViewDraft) => void;
  onUpdate?: (view: DashboardSavedView, filters: DashboardSignalFilters) => void;
  onDelete?: (view: DashboardSavedView) => void;
}) {
  const [selectedViewId, setSelectedViewId] = useState("");
  const [name, setName] = useState("");
  const selectedView = savedViews.find((view) => view.id === selectedViewId) ?? null;
  const canCreate = Boolean(name.trim()) && Boolean(onCreate) && !pending;
  const canUpdate = Boolean(selectedView) && Boolean(onUpdate) && !pending;
  const canDelete = Boolean(selectedView) && Boolean(onDelete) && !pending;

  function applySavedView(viewId: string | null) {
    const nextView = savedViews.find((view) => view.id === viewId) ?? null;
    if (!nextView) {
      setSelectedViewId("");
      return;
    }
    setSelectedViewId(nextView.id);
    onChange(nextView.filters);
    setName(nextView.name);
  }

  function updateFilters(patch: Partial<DashboardSignalFilters>) {
    onChange({ ...filters, ...patch });
  }

  return (
    <Card>
      <Stack gap="md">
        <SimpleGrid cols={{ base: 1, md: 3 }} spacing="sm">
          <MultiSelect
            label="Signal type"
            aria-label="Signal type"
            data={dashboardSignalTypes.map((type) => ({ value: type, label: formatSignalType(type) }))}
            value={filters.signalTypes}
            onChange={(value) => updateFilters({ signalTypes: value as DashboardSignalType[] })}
            clearable
          />
          <MultiSelect
            label="Severity"
            aria-label="Severity"
            data={dashboardSignalSeverities.map((severity) => ({ value: severity, label: formatSeverity(severity) }))}
            value={filters.severities}
            onChange={(value) => updateFilters({ severities: value as DashboardSignalSeverity[] })}
            clearable
          />
          <NativeSelect
            label="Date range"
            aria-label="Signal date range"
            value={filters.dateRange}
            data={dashboardDateRanges.map((range) => ({ value: range, label: formatDashboardDateRange(range) }))}
            onChange={(event) => updateFilters({ dateRange: event.currentTarget.value as DashboardSignalFilters["dateRange"] })}
          />
        </SimpleGrid>

        <Group gap="lg">
          <Switch
            label="Watch hits"
            aria-label="Watch hits"
            checked={filters.watchHitsOnly}
            onChange={(event) => updateFilters({ watchHitsOnly: event.currentTarget.checked })}
          />
          <Switch
            label="Low stock"
            aria-label="Low stock"
            checked={filters.lowStockOnly}
            onChange={(event) => updateFilters({ lowStockOnly: event.currentTarget.checked })}
          />
          <Switch
            label="Movement"
            aria-label="Movement"
            checked={filters.movementOnly}
            onChange={(event) => updateFilters({ movementOnly: event.currentTarget.checked })}
          />
          <Button variant="light" disabled={!filtersActive} onClick={() => onChange(defaultDashboardSignalFilters)}>
            Reset
          </Button>
        </Group>

        <Divider />

        <SimpleGrid cols={{ base: 1, md: 3 }} spacing="sm">
          <Select
            label="Saved view"
            aria-label="Saved view"
            placeholder="Select saved view"
            data={savedViews.map((view) => ({ value: view.id, label: view.name }))}
            value={selectedViewId || null}
            onChange={applySavedView}
            clearable
            clearButtonProps={{ "aria-label": "Clear saved view" }}
          />
          <TextInput
            label="View name"
            placeholder="Ops review"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <Group align="flex-end" gap="xs">
            <Button
              leftSection={<Plus size={16} aria-hidden="true" />}
              disabled={!canCreate}
              loading={pending}
              onClick={() => {
                onCreate?.({ name: name.trim(), filters });
              }}
            >
              Save
            </Button>
            <Button variant="light" disabled={!canUpdate} loading={pending} onClick={() => selectedView && onUpdate?.(selectedView, filters)}>
              Update
            </Button>
            <Tooltip label="Delete saved view">
              <ActionIcon
                aria-label="Delete saved view"
                color="red"
                variant="light"
                disabled={!canDelete}
                loading={pending}
                onClick={() => selectedView && onDelete?.(selectedView)}
              >
                <Trash2 size={16} aria-hidden="true" />
              </ActionIcon>
            </Tooltip>
          </Group>
        </SimpleGrid>
      </Stack>
    </Card>
  );
}

function TodaySignalsPanel({ signals, filtersActive }: { signals?: TodayInsight[] | null; filtersActive: boolean }) {
  if (!signals) {
    return (
      <Card>
        <Text fw={700}>Today signals unavailable</Text>
        <Text size="sm" c="dimmed" mt={4}>
          The server did not return readable observed signal data.
        </Text>
      </Card>
    );
  }

  if (signals.length === 0) {
    return (
      <Card>
        <Text fw={700}>{filtersActive ? "No today signals match filters" : "No observed signals today"}</Text>
        <Text size="sm" c="dimmed" mt={4}>
          New arrivals, watch hits, low observed stock, and exclude matches will appear here.
        </Text>
      </Card>
    );
  }

  return (
    <Card>
      <Stack gap="sm">
        {signals.map((signal) => (
          <SignalRow key={signal.signalId} signal={signal} />
        ))}
      </Stack>
    </Card>
  );
}

function MovementSignalsPanel({ signals, filtersActive }: { signals?: MovementSignal[] | null; filtersActive: boolean }) {
  if (!signals) {
    return (
      <Card>
        <Text fw={700}>Movement signals unavailable</Text>
        <Text size="sm" c="dimmed" mt={4}>
          The server did not return readable observed movement signal data.
        </Text>
      </Card>
    );
  }

  if (signals.length === 0) {
    return (
      <Card>
        <Text fw={700}>{filtersActive ? "No movement signals match filters" : "No movement signals recorded"}</Text>
        <Text size="sm" c="dimmed" mt={4}>
          Observed stock changes, restock observations, and fast mover candidates will appear here.
        </Text>
      </Card>
    );
  }

  return (
    <Card>
      <Stack gap="sm">
        {signals.map((signal) => (
          <SignalRow key={signal.signalId} signal={signal} />
        ))}
      </Stack>
    </Card>
  );
}

function OperatorDigestPanel({ digest }: { digest?: InsightDigest | null }) {
  if (!digest) {
    return (
      <Card>
        <Text fw={700}>Operator digest unavailable</Text>
        <Text size="sm" c="dimmed" mt={4}>
          The server did not return readable digest data.
        </Text>
      </Card>
    );
  }

  const stats = [
    { label: "Watch hits today", value: digest.counts.watchHitsToday },
    { label: "Low catalog stock", value: digest.counts.lowCatalogStockToday },
    { label: "Low live stock", value: digest.counts.lowLiveStockToday },
    { label: "Restock observations", value: digest.counts.restocksToday },
    { label: "Fast mover candidates", value: digest.counts.fastMoverCandidatesToday },
  ];

  return (
    <Card>
      <Stack gap="md">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
          {stats.map((stat) => (
            <Box key={stat.label}>
              <Text size="xs" fw={700} tt="uppercase" c="dimmed">
                {stat.label}
              </Text>
              <Text fw={700}>{stat.value}</Text>
            </Box>
          ))}
        </SimpleGrid>
        <Text size="sm" c="dimmed">
          Generated {formatOptionalDate(digest.generatedAt)} from observed catalog and live lookup data.
        </Text>
      </Stack>
    </Card>
  );
}

function CatalogTrendsPanel({ trends }: { trends?: CatalogTrendSummary | null }) {
  if (!trends) {
    return (
      <Card>
        <Text fw={700}>Catalog trends unavailable</Text>
        <Text size="sm" c="dimmed" mt={4}>
          The server did not return readable catalog trend data.
        </Text>
      </Card>
    );
  }

  return (
    <Card>
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Current window {formatOptionalDate(trends.window.currentFrom)} to {formatOptionalDate(trends.window.currentTo)} compared with the previous observed window.
        </Text>
        <Text size="sm" c="dimmed">
          Counts are catalog row observations; watch matches are rule-match rows. Treat them as supply and attention signals, not sales estimates.
        </Text>
        <SimpleGrid cols={{ base: 1, lg: 3 }} spacing="md">
          <TrendBucketTable title="Top Genres" buckets={trends.genres} />
          <TrendBucketTable title="Top Labels" buckets={trends.labels} />
          <TrendBucketTable title="Watch Overlap" buckets={trends.watchOverlap} />
        </SimpleGrid>
      </Stack>
    </Card>
  );
}

function NotificationCenterPanel({ deliveries }: { deliveries?: NotificationDelivery[] | null }) {
  if (!deliveries) {
    return (
      <Card>
        <Text fw={700}>Notification center unavailable</Text>
        <Text size="sm" c="dimmed" mt={4}>
          The server did not return readable read-only alert delivery data.
        </Text>
      </Card>
    );
  }

  if (deliveries.length === 0) {
    return (
      <Card>
        <Text fw={700}>No read-only alerts queued</Text>
        <Text size="sm" c="dimmed" mt={4}>
          Queued signal and operator digest alerts will appear here after notification refresh runs.
        </Text>
      </Card>
    );
  }

  return (
    <Card>
      <Table.ScrollContainer minWidth={820}>
        <Table verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Status</Table.Th>
              <Table.Th>Subject</Table.Th>
              <Table.Th>Signal</Table.Th>
              <Table.Th>Score</Table.Th>
              <Table.Th>Channel</Table.Th>
              <Table.Th>Queued</Table.Th>
              <Table.Th>Sent</Table.Th>
              <Table.Th>Last error</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {deliveries.map((delivery) => (
              <Table.Tr key={delivery.id}>
                <Table.Td>
                  <Text size="sm" c={deliveryStatusColor(delivery.status)}>
                    {formatDeliveryStatus(delivery.status)}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text fw={700}>{delivery.subject}</Text>
                  <Text size="xs" c="dimmed">
                    {delivery.ruleName ?? "direct delivery"}
                  </Text>
                </Table.Td>
                <Table.Td>{delivery.signalType ? formatSignalType(delivery.signalType) : "Operator digest"}</Table.Td>
                <Table.Td>{delivery.score ?? "N/A"}</Table.Td>
                <Table.Td>{delivery.channelName ?? "N/A"}</Table.Td>
                <Table.Td>{formatOptionalDate(delivery.queuedAt)}</Table.Td>
                <Table.Td>{formatOptionalDate(delivery.sentAt)}</Table.Td>
                <Table.Td>{delivery.lastError ?? "N/A"}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Card>
  );
}

function NotificationRulesPanel({ rules }: { rules?: NotificationRule[] | null }) {
  if (!rules) {
    return (
      <Card>
        <Text fw={700}>Notification rules unavailable</Text>
        <Text size="sm" c="dimmed" mt={4}>
          The server did not return readable notification rule data.
        </Text>
      </Card>
    );
  }

  if (rules.length === 0) {
    return (
      <Card>
        <Text fw={700}>No notification rules configured</Text>
        <Text size="sm" c="dimmed" mt={4}>
          Add rules through the admin API to queue read-only alerts for observed signals and operator digests.
        </Text>
      </Card>
    );
  }

  return (
    <Card>
      <Table.ScrollContainer minWidth={720}>
        <Table verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Rule</Table.Th>
              <Table.Th>Channel</Table.Th>
              <Table.Th>Signal types</Table.Th>
              <Table.Th>Severities</Table.Th>
              <Table.Th>Min score</Table.Th>
              <Table.Th>Cooldown</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rules.map((rule) => (
              <Table.Tr key={rule.id}>
                <Table.Td>
                  <Stack gap={2}>
                    <Text size="sm" c={rule.enabled ? "gray.8" : "dimmed"}>
                      {rule.enabled ? "On" : "Off"}
                    </Text>
                    {rule.includeDigest ? (
                      <Text size="xs" c="dimmed">
                        Digest
                      </Text>
                    ) : null}
                  </Stack>
                  <Text fw={700} mt={4}>
                    {rule.name}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text>{rule.channelName}</Text>
                  <Text size="xs" c="dimmed">
                    {formatNotificationChannelType(rule.channelType)}
                  </Text>
                </Table.Td>
                <Table.Td>{rule.signalTypes.length > 0 ? rule.signalTypes.map(formatSignalType).join(", ") : "All"}</Table.Td>
                <Table.Td>{rule.severities.length > 0 ? rule.severities.join(", ") : "All"}</Table.Td>
                <Table.Td>{rule.minScore}</Table.Td>
                <Table.Td>{rule.cooldownMinutes} min</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Card>
  );
}

function NotificationChannelsPanel({ channels }: { channels?: NotificationChannel[] | null }) {
  if (!channels) {
    return (
      <Card>
        <Text fw={700}>Notification channels unavailable</Text>
        <Text size="sm" c="dimmed" mt={4}>
          The server did not return readable notification channel data.
        </Text>
      </Card>
    );
  }

  if (channels.length === 0) {
    return (
      <Card>
        <Text fw={700}>No notification channels configured</Text>
        <Text size="sm" c="dimmed" mt={4}>
          The default in-app read-only alert channel is created by migration.
        </Text>
      </Card>
    );
  }

  return (
    <Card>
      <Table.ScrollContainer minWidth={640}>
        <Table verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Channel</Table.Th>
              <Table.Th>Type</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Masked config summary</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {channels.map((channel) => (
              <Table.Tr key={channel.id}>
                <Table.Td>
                  <Text fw={700}>{channel.name}</Text>
                  <Text size="xs" c="dimmed">
                    updated {formatOptionalDate(channel.updatedAt)}
                  </Text>
                </Table.Td>
                <Table.Td>{formatNotificationChannelType(channel.type)}</Table.Td>
                <Table.Td>
                  <Text size="sm" c={channel.enabled ? "gray.8" : "dimmed"}>
                    {channel.enabled ? "On" : "Off"}
                  </Text>
                </Table.Td>
                <Table.Td>{channel.configSummary}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Card>
  );
}

function SignalRow({ signal }: { signal: TodayInsight }) {
  return (
    <Box>
      <Group justify="space-between" align="flex-start" gap="sm">
        <Stack gap={4}>
          <Group gap="xs">
            <Text size="sm" c={signalSeverityColor(signal.severity)}>
              {formatSignalType(signal.type)}
            </Text>
            <Text size="sm" c="dimmed">
              score {signal.score}
            </Text>
          </Group>
          <Text fw={700}>{signal.title}</Text>
          <Text size="sm" c="dimmed">
            {signal.detail}
          </Text>
        </Stack>
        <Text size="sm" c="dimmed" ta="right">
          {formatOptionalDate(signal.createdAt)}
        </Text>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs" mt="sm">
        <SignalFact label="Artist / Title" value={formatArtistTitle(signal)} />
        <SignalFact label="Label / Genre" value={formatLabelGenre(signal)} />
        <SignalFact label="Catalog stock" value={signal.item.stock === null ? "not reported" : String(signal.item.stock)} />
        <SignalFact label="Juno ID" value={signal.item.junoId ?? "N/A"} />
      </SimpleGrid>

      {signal.reasons.length > 0 ? (
        <Text size="sm" c="dimmed" mt="sm">
          {signal.reasons.join(" ")}
        </Text>
      ) : null}
      <Divider mt="sm" />
    </Box>
  );
}

function TrendBucketTable({ title, buckets }: { title: string; buckets: TrendBucket[] }) {
  return (
    <Box>
      <Text fw={700} mb="xs">
        {title}
      </Text>
      {buckets.length === 0 ? (
        <Text size="sm" c="dimmed">
          No observed catalog trend rows in this window.
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={360}>
          <Table verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Current</Table.Th>
                <Table.Th>Previous</Table.Th>
                <Table.Th>Delta</Table.Th>
                <Table.Th>Watch matches</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {buckets.map((bucket) => (
                <Table.Tr key={bucket.key}>
                  <Table.Td>{bucket.label}</Table.Td>
                  <Table.Td>{bucket.currentCount}</Table.Td>
                  <Table.Td>{bucket.previousCount}</Table.Td>
                  <Table.Td>{formatDelta(bucket.delta)}</Table.Td>
                  <Table.Td>{bucket.watchHitCount}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Box>
  );
}

function WatchRulesPanel({
  rules,
  pending,
  onCreate,
  onToggle,
  onDelete,
}: {
  rules?: WatchRule[] | null;
  pending: boolean;
  onCreate?: (draft: WatchRuleDraft) => void;
  onToggle?: (rule: WatchRule) => void;
  onDelete?: (rule: WatchRule) => void;
}) {
  const [type, setType] = useState<WatchRuleType>("artist");
  const [pattern, setPattern] = useState("");
  const [weight, setWeight] = useState<number | string>("");

  if (!rules) {
    return (
      <Card>
        <Text fw={700}>Watch rules unavailable</Text>
        <Text size="sm" c="dimmed" mt={4}>
          The server did not return readable watch rule data.
        </Text>
      </Card>
    );
  }

  const canSubmit = Boolean(pattern.trim()) && Boolean(onCreate) && !pending;

  function submitRule() {
    onCreate?.({
      type,
      pattern: pattern.trim(),
      weight: normalizeDraftWeight(weight),
    });
    setPattern("");
    setWeight("");
  }

  return (
    <Card>
      <Stack gap="md">
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="xs">
          <NativeSelect
            label="Rule type"
            aria-label="Watch rule type"
            value={type}
            data={watchRuleTypeOptions}
            onChange={(event) => setType(event.currentTarget.value as WatchRuleType)}
          />
          <TextInput
            label="Pattern"
            placeholder="Artist, label, genre, or keyword"
            value={pattern}
            onChange={(event) => setPattern(event.currentTarget.value)}
          />
          <NumberInput
            label="Weight"
            placeholder={type === "exclude_keyword" ? "-10" : "10"}
            min={-100}
            max={100}
            step={1}
            value={weight}
            onChange={setWeight}
          />
        </SimpleGrid>
        <Group justify="flex-end">
          <Button
            leftSection={<Plus size={16} aria-hidden="true" />}
            disabled={!canSubmit}
            loading={pending}
            onClick={submitRule}
          >
            Add rule
          </Button>
        </Group>

        {rules.length === 0 ? (
          <Text size="sm" c="dimmed">
            No watch rules configured. Add artist, label, genre, keyword, or exclude keyword rules to surface observed signals.
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={520}>
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Rule</Table.Th>
                  <Table.Th>Weight</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rules.map((rule) => (
                  <Table.Tr key={rule.id}>
                    <Table.Td>
                      <Stack gap={2}>
                        <Text size="sm" c={rule.type === "exclude_keyword" ? "red.7" : "gray.8"}>
                          {formatWatchRuleType(rule.type)}
                        </Text>
                        <Text fw={700}>{rule.pattern}</Text>
                        <Text size="xs" c="dimmed">
                          normalized {rule.patternNorm}
                        </Text>
                      </Stack>
                    </Table.Td>
                    <Table.Td>{rule.weight}</Table.Td>
                    <Table.Td>
                      <Switch
                        aria-label={`Toggle ${rule.pattern}`}
                        checked={rule.enabled}
                        disabled={pending || !onToggle}
                        label={rule.enabled ? "On" : "Off"}
                        onChange={() => onToggle?.(rule)}
                      />
                    </Table.Td>
                    <Table.Td>
                      <Tooltip label="Delete watch rule">
                        <ActionIcon
                          aria-label={`Delete ${rule.pattern}`}
                          color="red"
                          variant="light"
                          disabled={pending || !onDelete}
                          onClick={() => onDelete?.(rule)}
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </ActionIcon>
                      </Tooltip>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Stack>
    </Card>
  );
}

function GmailIngestStatusPanel({ state }: { state?: GmailIngestState | null }) {
  if (!state) {
    return (
      <Card>
        <Text fw={700}>Mail ingest status unavailable</Text>
        <Text size="sm" c="dimmed" mt={4}>
          The server did not return a readable ingest state.
        </Text>
      </Card>
    );
  }

  return (
    <Card>
      <Group justify="space-between" align="flex-start">
        <Stack gap={4}>
          <Text fw={700}>Last mail ingest run</Text>
          <Text size="sm" c="dimmed">
            {formatIngestRunDetail(state)}
          </Text>
        </Stack>
        <Text size="sm" c="dimmed">
          {formatIngestStatus(state.lastQueryStatus)}
        </Text>
      </Group>

      {state.lastQueryError ? (
        <Alert
          mt="md"
          color="red"
          icon={<AlertTriangle size={18} aria-hidden="true" />}
          title="Last run failed"
        >
          {state.lastQueryError}
        </Alert>
      ) : null}

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm" mt="md">
        <IngestFact
          label="Messages / Attachments"
          value={`${state.lastQueryMessageCount} / ${state.lastQueryAttachmentCount}`}
          detail="latest run totals"
        />
        <IngestFact
          label="Last Successful Mail"
          value={formatOptionalDate(state.lastSuccessfulMessageReceivedAt)}
          detail="stored success cursor"
        />
        <IngestFact
          label="Latest Catalog Date"
          value={state.lastIngestedCatalogDate ?? "N/A"}
          detail={formatSnapshotDetail(state.lastIngestedSnapshotId)}
        />
        <IngestFact
          label="Sheet Content Hash"
          value={formatHash(state.lastIngestedContentHash)}
          detail="latest stored sheet hash"
        />
      </SimpleGrid>

      <Divider my="md" />
      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="sm">
        <Stack gap={4}>
          <Text size="xs" fw={700} tt="uppercase" c="dimmed">
            Query window
          </Text>
          <Text size="sm">{formatQueryWindow(state)}</Text>
        </Stack>
        <Stack gap={4}>
          <Text size="xs" fw={700} tt="uppercase" c="dimmed">
            Mail query
          </Text>
          <Code block>{state.lastQuery ?? "N/A"}</Code>
        </Stack>
      </SimpleGrid>
    </Card>
  );
}

function IngestFact({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Box>
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Text mt={4} fw={700}>
        {value}
      </Text>
      <Text mt={2} size="sm" c="dimmed">
        {detail}
      </Text>
    </Box>
  );
}

function SignalFact({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Text size="xs" fw={700} tt="uppercase" c="dimmed">
        {label}
      </Text>
      <Text size="sm">{value}</Text>
    </Box>
  );
}

function signalSeverityColor(severity: TodayInsight["severity"]): string {
  if (severity === "critical") {
    return "red";
  }
  if (severity === "warning") {
    return "yellow";
  }
  if (severity === "watch") {
    return "blue";
  }
  return "gray";
}

function deliveryStatusColor(status: NotificationDelivery["status"]): string {
  if (status === "sent") {
    return "green";
  }
  if (status === "failed") {
    return "red";
  }
  if (status === "skipped") {
    return "gray";
  }
  return "blue";
}

function formatArtistTitle(signal: TodayInsight): string {
  return [signal.item.artist, signal.item.title].filter(Boolean).join(" - ") || "N/A";
}

function formatLabelGenre(signal: TodayInsight): string {
  return [signal.item.label, signal.item.genre].filter(Boolean).join(" / ") || "N/A";
}

function normalizeDraftWeight(value: number | string): number | null {
  const parsed = value === "" ? Number.NaN : Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function formatDelta(value: number): string {
  if (value > 0) {
    return `+${value}`;
  }
  return String(value);
}

function formatIngestStatus(status: GmailIngestState["lastQueryStatus"]): string {
  if (status === "succeeded") {
    return "Succeeded";
  }
  if (status === "running") {
    return "Running";
  }
  if (status === "failed") {
    return "Failed";
  }
  return "Not run";
}

function formatIngestRunDetail(state: GmailIngestState): string {
  if (state.lastQueryStatus === "running") {
    return `started ${formatOptionalDate(state.lastQueryStartedAt)}`;
  }
  if (state.lastQueryFinishedAt) {
    return `finished ${formatOptionalDate(state.lastQueryFinishedAt)}`;
  }
  return "no recorded mail ingest run";
}

function formatSnapshotDetail(snapshotId: string | null): string {
  if (!snapshotId) {
    return "no stored snapshot yet";
  }
  return `snapshot ${snapshotId.slice(0, 8)}`;
}

function formatHash(hash: string | null): string {
  if (!hash) {
    return "N/A";
  }
  if (hash.length <= 18) {
    return hash;
  }
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

function formatQueryWindow(state: GmailIngestState): string {
  if (!state.lastQueryWindowFrom && !state.lastQueryWindowTo) {
    return "N/A";
  }
  return `${formatOptionalDate(state.lastQueryWindowFrom)} -> ${formatOptionalDate(state.lastQueryWindowTo)}`;
}

function SetupChecklist({ setupStatus }: { setupStatus?: AppSetupStatus | null }) {
  const steps = setupStatus?.steps ?? [];

  if (steps.length === 0) {
    return (
      <Card>
        <Text fw={700}>Setup status unavailable</Text>
        <Text size="sm" c="dimmed" mt={4}>
          Configuration status will appear after the server can evaluate required settings.
        </Text>
        <Button component="a" href="/settings" variant="light" mt="md">
          Open Settings Center
        </Button>
      </Card>
    );
  }

  return (
    <Stack gap="sm">
      <Alert
        color={setupStatus?.ready ? "green" : "red"}
        icon={setupStatus?.ready ? <CheckCircle2 size={18} aria-hidden="true" /> : <AlertTriangle size={18} aria-hidden="true" />}
        title={setupStatus?.ready ? "Configuration is usable" : "Configuration action required"}
      >
        {setupStatus?.ready
          ? "Required settings are present. Review warnings before enabling unattended automation."
          : "One or more required settings are missing or unsafe. The affected feature should remain disabled until fixed."}
      </Alert>
      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="sm">
        {steps.map((step) => (
          <SetupStepCard key={step.id} step={step} />
        ))}
      </SimpleGrid>
    </Stack>
  );
}

function ApiIssuePanel({ issues }: { issues: DashboardResourceIssue[] }) {
  return (
    <Alert color="yellow" icon={<AlertTriangle size={18} aria-hidden="true" />} title="API status issue">
      <Stack gap="xs">
        {issues.map((issue) => (
          <Group key={`${issue.endpoint}-${issue.status}`} justify="space-between" align="flex-start" gap="sm">
            <Stack gap={2}>
              <Text size="sm" fw={700}>
                {issue.label}
              </Text>
              <Text size="sm" c="dimmed">
                {issue.message}
              </Text>
            </Stack>
            <Text size="sm" c={apiIssueColor(issue.status)}>
              {issue.httpStatus ?? issue.status}
            </Text>
          </Group>
        ))}
        <Button component="a" href="/settings" size="xs" variant="light">
          Review Settings Center
        </Button>
      </Stack>
    </Alert>
  );
}

function apiIssueColor(status: DashboardResourceIssue["status"]): string {
  if (status === "unauthorized" || status === "forbidden") {
    return "red";
  }
  if (status === "server_error") {
    return "orange";
  }
  return "yellow";
}

function SetupStepCard({ step }: { step: SetupStep }) {
  return (
    <Card>
      <Stack gap={4}>
        <Text fw={700}>{step.label}</Text>
        <Text size="sm" c="dimmed">
          {step.detail}
        </Text>
      </Stack>
      {step.missing.length > 0 ? (
        <Stack gap={6} mt="md">
          <Text size="xs" fw={700} tt="uppercase" c="red.7">
            Required before use
          </Text>
          <Group gap={6}>
            {step.missing.map((item) => (
              <Code key={item}>{item}</Code>
            ))}
          </Group>
        </Stack>
      ) : null}
      {step.action ? (
        <Text size="sm" c={step.state === "disabled" ? "dimmed" : "red.7"} mt="md">
          {step.action}
        </Text>
      ) : null}
      {step.guardrails.length > 0 ? (
        <>
          <Divider my="md" />
          <Stack gap="xs">
            <Text size="xs" fw={700} tt="uppercase" c="dimmed">
              Guardrails
            </Text>
            {step.guardrails.map((guardrail) => (
              <SetupGuardrailRow key={guardrail.label} guardrail={guardrail} />
            ))}
          </Stack>
        </>
      ) : null}
    </Card>
  );
}

function SetupGuardrailRow({ guardrail }: { guardrail: SetupGuardrail }) {
  const presentation = setupGuardrailPresentation(guardrail);
  return (
    <Box>
      <Group justify="space-between" gap="xs" align="flex-start">
        <Stack gap={2}>
          <Text size="sm" fw={600}>
            {guardrail.label}
          </Text>
          <Text size="sm" c="dimmed">
            {guardrail.detail}
          </Text>
        </Stack>
        <Text size="sm" c={presentation.color}>
          {presentation.label}
        </Text>
      </Group>
    </Box>
  );
}

function setupGuardrailPresentation(guardrail: SetupGuardrail): { label: string; color: string } {
  if (guardrail.state === "ok") {
    return { label: "OK", color: "green" };
  }
  if (guardrail.state === "warning") {
    return { label: "Review", color: "yellow" };
  }
  return { label: "Blocked", color: "red" };
}

function formatObservedAt(value: string | null | undefined): string {
  if (!value) {
    return "no live observation yet";
  }
  return `last observed ${new Date(value).toLocaleString()}`;
}

function WorkerControlPanel({
  status,
  pending,
  disabledReason,
  onAction,
}: {
  status?: LiveWorkerStatus | null;
  pending: boolean;
  disabledReason?: string | null;
  onAction?: (action: LiveWorkerAction) => void;
}) {
  const isRunning = status?.state === "running";
  const latestLogs = status?.recentLogs.slice(-4) ?? [];
  const startDisabled = pending || isRunning || !onAction || Boolean(disabledReason);
  const restartDisabled = pending || !onAction || Boolean(disabledReason);

  return (
    <Card>
      <Group justify="space-between" align="flex-start">
        <Stack gap={4}>
          <Text fw={700}>Background Worker</Text>
          <Text size="sm" c="dimmed">
            {formatWorkerDetail(status)}
          </Text>
        </Stack>
        <Text size="sm" c="dimmed">
          {status?.state ?? "unknown"}
        </Text>
      </Group>

      <Group mt="md" gap="xs">
        <Button
          leftSection={<Play size={16} aria-hidden="true" />}
          disabled={startDisabled}
          onClick={() => onAction?.("start")}
        >
          Start
        </Button>
        <Button
          variant="light"
          color="red"
          leftSection={<Square size={16} aria-hidden="true" />}
          disabled={pending || !isRunning || !onAction}
          onClick={() => onAction?.("stop")}
        >
          Stop
        </Button>
        <Button
          variant="light"
          leftSection={<RotateCw size={16} aria-hidden="true" />}
          disabled={restartDisabled}
          onClick={() => onAction?.("restart")}
        >
          Restart
        </Button>
      </Group>

      {disabledReason ? (
        <Alert color="yellow" mt="md" icon={<AlertTriangle size={18} aria-hidden="true" />} title="Cannot start yet">
          {disabledReason}
        </Alert>
      ) : null}

      {status ? (
        <Code mt="md" block>
          {[`${status.command} ${status.args.join(" ")}`.trim(), ...latestLogs.map(formatWorkerLogLine)].join("\n")}
        </Code>
      ) : null}
    </Card>
  );
}

function getLiveWorkerDisabledReason(setupStatus?: AppSetupStatus | null): string | null {
  if (!setupStatus?.steps.length) {
    return "Setup status is unavailable. Open Settings Center to review database and Juno live lookup settings.";
  }
  const databaseStep = setupStatus.steps.find((step) => step.id === "database");
  if (!databaseStep || databaseStep.state === "missing") {
    return "Database connection or saved settings are unavailable.";
  }
  const junoStep = setupStatus.steps.find((step) => step.id === "juno");
  if (!junoStep) {
    return "Set Juno read-only login credentials and delay guardrails.";
  }
  const missingCredentials = junoStep.settings.some((setting) =>
    (setting.key === "juno_login_email" || setting.key === "juno_login_password") && setting.state !== "configured",
  ) || junoStep.missing.some((key) => key === "juno_login_email" || key === "juno_login_password");
  if (missingCredentials) {
    return "Set Juno read-only login credentials.";
  }
  const blockedGuardrail = junoStep.guardrails.find((guardrail) => guardrail.state === "blocked");
  if (blockedGuardrail) {
    return blockedGuardrail.detail;
  }
  return null;
}

function formatWorkerDetail(status?: LiveWorkerStatus | null): string {
  if (!status) {
    return "worker status unavailable";
  }
  if (status.state === "running") {
    return `pid ${status.pid ?? "N/A"} since ${formatOptionalDate(status.startedAt)}`;
  }
  if (status.lastError) {
    return status.lastError;
  }
  return `last stopped ${formatOptionalDate(status.stoppedAt)}`;
}

function formatOptionalDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "N/A";
}

function formatWorkerLogLine(log: LiveWorkerStatus["recentLogs"][number]): string {
  return `[${log.stream}] ${log.line}`;
}
