"use client";

import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Code,
  Container,
  Divider,
  Grid,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Clock3,
  ClipboardCheck,
  MailSearch,
  PackageCheck,
  PackageSearch,
  Play,
  RotateCw,
  Square,
} from "lucide-react";
import { CommandPanel } from "./CommandPanel";
import { PipelineCard } from "./PipelineCard";
import { SectionHeader } from "./SectionHeader";
import { StatCard } from "./StatCard";
import type {
  AppSetupStatus,
  GmailIngestState,
  LiveLookupDashboardSummary,
  LiveWorkerAction,
  LiveWorkerStatus,
  PipelineItem,
  SetupGuardrail,
  SetupSetting,
  SetupStep,
  StatCardData,
} from "./types";

export type CatalogOpsDashboardProps = {
  stats: StatCardData[];
  pipeline: PipelineItem[];
  commands: string[];
  ingestState?: GmailIngestState | null;
  liveSummary?: LiveLookupDashboardSummary | null;
  workerStatus?: LiveWorkerStatus | null;
  setupStatus?: AppSetupStatus | null;
  workerActionPending?: boolean;
  onWorkerAction?: (action: LiveWorkerAction) => void;
};

export function CatalogOpsDashboard({
  stats,
  pipeline,
  commands,
  ingestState,
  liveSummary,
  workerStatus,
  setupStatus,
  workerActionPending = false,
  onWorkerAction,
}: CatalogOpsDashboardProps) {
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
              <Badge
                color="sage"
                size="lg"
                variant="outline"
                leftSection={<Clock3 size={14} aria-hidden="true" />}
              >
                Daily polling MVP
              </Badge>
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
            <SectionHeader icon={ClipboardCheck}>Configuration</SectionHeader>
            <SetupChecklist setupStatus={setupStatus} />
          </Grid.Col>

          <Grid.Col span={{ base: 12, lg: 8 }}>
            <SectionHeader icon={PackageCheck}>Ingestion Pipeline</SectionHeader>
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              {pipeline.map((item) => (
                <PipelineCard key={item.title} {...item} />
              ))}
            </SimpleGrid>
          </Grid.Col>

          <Grid.Col span={{ base: 12, lg: 4 }}>
            <CommandPanel commands={commands} />
          </Grid.Col>

          <Grid.Col span={12}>
            <SectionHeader icon={MailSearch}>Gmail Ingest State</SectionHeader>
            <GmailIngestStatusPanel state={ingestState} />
          </Grid.Col>

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

          <Grid.Col span={12}>
            <WorkerControlPanel
              status={workerStatus}
              pending={workerActionPending}
              onAction={onWorkerAction}
            />
          </Grid.Col>
        </Grid>
      </Container>
    </Box>
  );
}

function GmailIngestStatusPanel({ state }: { state?: GmailIngestState | null }) {
  if (!state) {
    return (
      <Card>
        <Text fw={700}>Gmail ingest status unavailable</Text>
        <Text size="sm" c="dimmed" mt={4}>
          The server did not return a readable ingest state.
        </Text>
      </Card>
    );
  }

  const status = ingestStatusPresentation(state.lastQueryStatus);

  return (
    <Card>
      <Group justify="space-between" align="flex-start">
        <Stack gap={4}>
          <Text fw={700}>Last Gmail run</Text>
          <Text size="sm" c="dimmed">
            {formatIngestRunDetail(state)}
          </Text>
        </Stack>
        <Badge color={status.color} variant="light">
          {status.label}
        </Badge>
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
            Gmail query
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

function ingestStatusPresentation(status: GmailIngestState["lastQueryStatus"]): { label: string; color: string } {
  if (status === "succeeded") {
    return { label: "Succeeded", color: "green" };
  }
  if (status === "running") {
    return { label: "Running", color: "blue" };
  }
  if (status === "failed") {
    return { label: "Failed", color: "red" };
  }
  return { label: "Not run", color: "gray" };
}

function formatIngestRunDetail(state: GmailIngestState): string {
  if (state.lastQueryStatus === "running") {
    return `started ${formatOptionalDate(state.lastQueryStartedAt)}`;
  }
  if (state.lastQueryFinishedAt) {
    return `finished ${formatOptionalDate(state.lastQueryFinishedAt)}`;
  }
  return "no recorded Gmail ingest run";
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
          Configuration status will appear after the server can evaluate runtime settings.
        </Text>
      </Card>
    );
  }

  return (
    <Stack gap="sm">
      <Alert
        color={setupStatus?.ready ? "green" : "red"}
        icon={setupStatus?.ready ? <CheckCircle2 size={18} aria-hidden="true" /> : <AlertTriangle size={18} aria-hidden="true" />}
        title={setupStatus?.ready ? "Runtime configuration is usable" : "Configuration action required"}
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

function SetupStepCard({ step }: { step: SetupStep }) {
  const status = setupStepPresentation(step);
  return (
    <Card>
      <Group justify="space-between" align="flex-start">
        <Stack gap={4}>
          <Text fw={700}>{step.label}</Text>
          <Text size="sm" c="dimmed">
            {step.detail}
          </Text>
        </Stack>
        <Badge color={status.color} variant="light">
          {status.label}
        </Badge>
      </Group>
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
      <Divider my="md" />
      <Stack gap="xs">
        <Text size="xs" fw={700} tt="uppercase" c="dimmed">
          Resolved settings
        </Text>
        {step.settings.map((setting) => (
          <SetupSettingRow key={setting.key} setting={setting} />
        ))}
      </Stack>
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

function setupStepPresentation(step: SetupStep): { label: string; color: string } {
  if (step.state === "complete") {
    return { label: "Complete", color: "green" };
  }
  if (step.state === "disabled") {
    return { label: "Disabled", color: "gray" };
  }
  if (step.state === "warning") {
    return { label: "Review", color: "yellow" };
  }
  return { label: "Missing", color: "red" };
}

function SetupSettingRow({ setting }: { setting: SetupSetting }) {
  const source = setupSettingSourcePresentation(setting);
  const state = setupSettingStatePresentation(setting);

  return (
    <Box>
      <Group justify="space-between" gap="xs" align="flex-start">
        <Stack gap={2}>
          <Text size="sm" fw={600}>
            {setting.label}
          </Text>
          <Group gap={4}>
            <Badge color={source.color} size="xs" variant="light">
              {source.label}
            </Badge>
            <Badge color={state.color} size="xs" variant="light">
              {state.label}
            </Badge>
          </Group>
        </Stack>
        <Text size="sm" ta="right" c={setting.state === "missing" ? "red.7" : "gray.8"} lineClamp={2}>
          {setting.value}
        </Text>
      </Group>
    </Box>
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
        <Badge color={presentation.color} size="xs" variant="light">
          {presentation.label}
        </Badge>
      </Group>
    </Box>
  );
}

function setupSettingSourcePresentation(setting: SetupSetting): { label: string; color: string } {
  if (setting.source === "database") {
    return { label: "DB override", color: "blue" };
  }
  if (setting.source === "runtime") {
    return { label: "Env/default", color: "grape" };
  }
  return { label: "Unset", color: "red" };
}

function setupSettingStatePresentation(setting: SetupSetting): { label: string; color: string } {
  if (setting.state === "configured") {
    return { label: setting.secret ? "Secret set" : "Set", color: "green" };
  }
  if (setting.state === "disabled") {
    return { label: "Optional", color: "gray" };
  }
  return { label: "Missing", color: "red" };
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
  onAction,
}: {
  status?: LiveWorkerStatus | null;
  pending: boolean;
  onAction?: (action: LiveWorkerAction) => void;
}) {
  const isRunning = status?.state === "running";
  const latestLogs = status?.recentLogs.slice(-4) ?? [];

  return (
    <Card>
      <Group justify="space-between" align="flex-start">
        <Stack gap={4}>
          <Text fw={700}>Background Worker</Text>
          <Text size="sm" c="dimmed">
            {formatWorkerDetail(status)}
          </Text>
        </Stack>
        <Badge color={isRunning ? "green" : "gray"} variant="light">
          {status?.state ?? "unknown"}
        </Badge>
      </Group>

      <Group mt="md" gap="xs">
        <Button
          leftSection={<Play size={16} aria-hidden="true" />}
          disabled={pending || isRunning || !onAction}
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
          disabled={pending || !onAction}
          onClick={() => onAction?.("restart")}
        >
          Restart
        </Button>
      </Group>

      {status ? (
        <Code mt="md" block>
          {[`${status.command} ${status.args.join(" ")}`.trim(), ...latestLogs.map(formatWorkerLogLine)].join("\n")}
        </Code>
      ) : null}
    </Card>
  );
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
