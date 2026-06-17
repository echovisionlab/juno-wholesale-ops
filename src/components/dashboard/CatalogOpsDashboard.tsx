"use client";

import { Badge, Box, Button, Card, Code, Container, Grid, Group, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Clock3,
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
import type { LiveLookupDashboardSummary, LiveWorkerAction, LiveWorkerStatus, PipelineItem, StatCardData } from "./types";

export type CatalogOpsDashboardProps = {
  stats: StatCardData[];
  pipeline: PipelineItem[];
  commands: string[];
  liveSummary?: LiveLookupDashboardSummary | null;
  workerStatus?: LiveWorkerStatus | null;
  workerActionPending?: boolean;
  onWorkerAction?: (action: LiveWorkerAction) => void;
};

export function CatalogOpsDashboard({
  stats,
  pipeline,
  commands,
  liveSummary,
  workerStatus,
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
                  Wholesale Ops
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
