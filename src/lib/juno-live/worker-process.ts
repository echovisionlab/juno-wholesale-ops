import { spawn, type ChildProcessByStdio } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import type { Readable } from "node:stream";

export type WorkerProcessState = "stopped" | "running" | "exited";

export type WorkerProcessLogLine = {
  stream: "stdout" | "stderr";
  line: string;
  occurredAt: string;
};

export type WorkerProcessStatus = {
  state: WorkerProcessState;
  pid: number | null;
  startedAt: string | null;
  stoppedAt: string | null;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  lastError: string | null;
  command: string;
  args: string[];
  recentLogs: WorkerProcessLogLine[];
};

export type WorkerProcessCommand = {
  command: string;
  args: string[];
};

type WorkerProcessEnv = Record<string, string | undefined>;
type WorkerChildProcess = ChildProcessByStdio<null, Readable, Readable>;
type SpawnFn = (command: string, args: string[], options: NonNullable<Parameters<typeof spawn>[2]>) => WorkerChildProcess;

export class JunoLiveWorkerProcessManager {
  private child: WorkerChildProcess | null = null;
  private state: WorkerProcessState = "stopped";
  private startedAt: string | null = null;
  private stoppedAt: string | null = null;
  private exitCode: number | null = null;
  private signal: NodeJS.Signals | null = null;
  private lastError: string | null = null;
  private readonly recentLogs: WorkerProcessLogLine[] = [];
  private exitWaiter: (() => void) | null = null;

  constructor(
    private readonly options: {
      cwd?: string;
      env?: WorkerProcessEnv;
      spawnFn?: SpawnFn;
      now?: () => Date;
      logLimit?: number;
    } = {},
  ) {}

  start(): WorkerProcessStatus {
    if (this.child && !this.child.killed && this.state === "running") {
      return this.getStatus();
    }

    const cwd = this.options.cwd ?? process.cwd();
    const { command, args } = resolveWorkerProcessCommand(cwd);
    const spawnFn: SpawnFn =
      this.options.spawnFn ?? ((workerCommand, workerArgs, spawnOptions) => spawn(workerCommand, workerArgs, spawnOptions) as WorkerChildProcess);
    const child = spawnFn(command, args, {
      cwd,
      env: {
        ...process.env,
        ...this.options.env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    this.child = child;
    this.state = "running";
    this.startedAt = this.isoNow();
    this.stoppedAt = null;
    this.exitCode = null;
    this.signal = null;
    this.lastError = null;

    child.stdout.on("data", (chunk: Buffer) => this.recordOutput("stdout", chunk));
    child.stderr.on("data", (chunk: Buffer) => this.recordOutput("stderr", chunk));
    child.once("error", (error) => {
      this.lastError = error.message;
      this.state = "exited";
      this.stoppedAt = this.isoNow();
      this.exitWaiter?.();
      this.exitWaiter = null;
    });
    child.once("exit", (code, signal) => {
      this.state = "exited";
      this.exitCode = code;
      this.signal = signal;
      this.stoppedAt = this.isoNow();
      this.child = null;
      this.exitWaiter?.();
      this.exitWaiter = null;
    });

    return this.getStatus();
  }

  stop(): WorkerProcessStatus {
    if (!this.child || this.state !== "running") {
      return this.getStatus();
    }

    this.child.kill("SIGTERM");
    return this.getStatus();
  }

  async stopAndWait(timeoutMs = 10000): Promise<WorkerProcessStatus> {
    if (!this.child || this.state !== "running") {
      return this.getStatus();
    }

    this.child.kill("SIGTERM");
    await Promise.race([
      new Promise<void>((resolve) => {
        this.exitWaiter = resolve;
      }),
      new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (this.child && this.state === "running") {
            this.lastError = `worker did not stop within ${timeoutMs}ms`;
            this.child.kill("SIGKILL");
          }
          resolve();
        }, timeoutMs);
        timeout.unref?.();
      }),
    ]);

    return this.getStatus();
  }

  async restart(): Promise<WorkerProcessStatus> {
    await this.stopAndWait();
    return this.start();
  }

  getStatus(): WorkerProcessStatus {
    const { command, args } = resolveWorkerProcessCommand(this.options.cwd ?? process.cwd());

    return {
      state: this.state,
      pid: this.child?.pid ?? null,
      startedAt: this.startedAt,
      stoppedAt: this.stoppedAt,
      exitCode: this.exitCode,
      signal: this.signal,
      lastError: this.lastError,
      command,
      args,
      recentLogs: [...this.recentLogs],
    };
  }

  private recordOutput(stream: "stdout" | "stderr", chunk: Buffer): void {
    const lines = chunk
      .toString("utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      this.recentLogs.push({ stream, line, occurredAt: this.isoNow() });
    }

    const logLimit = this.options.logLimit ?? 100;
    if (this.recentLogs.length > logLimit) {
      this.recentLogs.splice(0, this.recentLogs.length - logLimit);
    }
  }

  private isoNow(): string {
    return (this.options.now ?? (() => new Date()))().toISOString();
  }
}

export function resolveWorkerProcessCommand(cwd: string): WorkerProcessCommand {
  const localTsx = path.join(cwd, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
  if (fs.existsSync(localTsx)) {
    return {
      command: localTsx,
      args: ["-r", "tsconfig-paths/register", "scripts/juno-live-worker.ts", "--loop"],
    };
  }

  return {
    command: "pnpm",
    args: ["exec", "tsx", "-r", "tsconfig-paths/register", "scripts/juno-live-worker.ts", "--loop"],
  };
}

export function getJunoLiveWorkerProcessManager(): JunoLiveWorkerProcessManager {
  const globalStore = globalThis as typeof globalThis & {
    __junoLiveWorkerProcessManager?: JunoLiveWorkerProcessManager;
  };
  globalStore.__junoLiveWorkerProcessManager ??= new JunoLiveWorkerProcessManager();
  return globalStore.__junoLiveWorkerProcessManager;
}
