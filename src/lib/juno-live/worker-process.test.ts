import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { JunoLiveWorkerProcessManager, resolveWorkerProcessCommand } from "./worker-process";

describe("resolveWorkerProcessCommand", () => {
  it("uses the repo-local tsx binary when present", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "juno-worker-"));
    const binDir = path.join(cwd, "node_modules", ".bin");
    fs.mkdirSync(binDir, { recursive: true });
    const tsxPath = path.join(binDir, process.platform === "win32" ? "tsx.cmd" : "tsx");
    fs.writeFileSync(tsxPath, "");

    expect(resolveWorkerProcessCommand(cwd)).toEqual({
      command: tsxPath,
      args: ["-r", "tsconfig-paths/register", "scripts/juno-live-worker.ts", "--loop"],
    });
  });

  it("falls back to pnpm exec when local tsx is unavailable", () => {
    expect(resolveWorkerProcessCommand("/app")).toEqual({
      command: "pnpm",
      args: ["exec", "tsx", "-r", "tsconfig-paths/register", "scripts/juno-live-worker.ts", "--loop"],
    });
  });
});

describe("JunoLiveWorkerProcessManager", () => {
  it("starts, tracks output, and stops the worker child process", async () => {
    const child = new FakeChildProcess();
    const spawnFn = vi.fn(() => child.asChildProcess());
    const manager = new JunoLiveWorkerProcessManager({
      cwd: "/app",
      spawnFn: spawnFn as never,
      now: fixedDates(["2026-06-17T00:00:00.000Z", "2026-06-17T00:00:01.000Z"]),
      logLimit: 2,
    });

    const started = manager.start();
    child.stdout.emit("data", Buffer.from("first\nsecond\nthird\n"));
    child.stderr.emit("data", Buffer.from("warning\n"));

    expect(started).toMatchObject({
      state: "running",
      pid: 1234,
      command: "pnpm",
      args: ["exec", "tsx", "-r", "tsconfig-paths/register", "scripts/juno-live-worker.ts", "--loop"],
    });
    expect(spawnFn).toHaveBeenCalledWith(
      "pnpm",
      ["exec", "tsx", "-r", "tsconfig-paths/register", "scripts/juno-live-worker.ts", "--loop"],
      expect.objectContaining({
        cwd: "/app",
        env: expect.any(Object),
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );
    expect(manager.getStatus().recentLogs.map((log) => log.line)).toEqual(["third", "warning"]);

    await expect(manager.stopAndWait()).resolves.toMatchObject({
      state: "exited",
      signal: "SIGTERM",
    });
  });

  it("returns the existing status when start is called while running", () => {
    const child = new FakeChildProcess();
    const spawnFn = vi.fn(() => child.asChildProcess());
    const manager = new JunoLiveWorkerProcessManager({
      spawnFn: spawnFn as never,
    });

    manager.start();
    const secondStart = manager.start();

    expect(secondStart.state).toBe("running");
    expect(spawnFn).toHaveBeenCalledTimes(1);
  });
});

class FakeChildProcess extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly pid = 1234;
  killed = false;

  kill(signal?: NodeJS.Signals): boolean {
    this.killed = true;
    queueMicrotask(() => this.emit("exit", null, signal ?? "SIGTERM"));
    return true;
  }

  asChildProcess() {
    return this as never;
  }
}

function fixedDates(values: string[]): () => Date {
  let index = 0;
  return () => new Date(values[Math.min(index++, values.length - 1)]);
}
