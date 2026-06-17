import type { ComponentType } from "react";

export type DashboardIcon = ComponentType<{
  size?: number;
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

export type StatCardData = {
  label: string;
  value: string;
  detail: string;
  icon: DashboardIcon;
};

export type PipelineItem = {
  title: string;
  body: string;
  status: string;
};

export type LiveLookupDashboardSummary = {
  queued: number;
  running: number;
  succeeded: number;
  failed: number;
  blocked: number;
  manualRequired: number;
  latestObservedAt: string | null;
  latestDisplayStock: string | null;
};

export type LiveWorkerAction = "start" | "stop" | "restart";

export type LiveWorkerStatus = {
  state: "stopped" | "running" | "exited";
  pid: number | null;
  startedAt: string | null;
  stoppedAt: string | null;
  exitCode: number | null;
  signal: string | null;
  lastError: string | null;
  command: string;
  args: string[];
  recentLogs: Array<{
    stream: "stdout" | "stderr";
    line: string;
    occurredAt: string;
  }>;
};

export type SetupStepState = "complete" | "missing" | "disabled";

export type SetupStep = {
  id: "database" | "gmail" | "juno" | "auth";
  label: string;
  state: SetupStepState;
  detail: string;
  missing: string[];
};

export type AppSetupStatus = {
  ready: boolean;
  steps: SetupStep[];
};
