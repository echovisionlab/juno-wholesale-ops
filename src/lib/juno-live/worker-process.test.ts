import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { JunoLiveWorkerProcessManager, resolveWorkerProcessCommand } from "./worker-process";

describe("resolveWorkerProcessCommand", () => {
  it("uses explicit command and whitespace args", () => {
    expect(
      resolveWorkerProcessCommand("/app", {
        JUNO_LIVE_WORKER_COMMAND: "runner",
        JUNO_LIVE_WORKER_ARGS: "--loop --verbose",
      }),
    ).toEqual({ command: "runner", args: ["--loop", "--verbose"] });
  });

  it("uses explicit command and JSON args", () => {
    expect(
      resolveWorkerProcessCommand("/app", {
        JUNO_LIVE_WORKER_COMMAND: "runner",
        JUNO_LIVE_WORKER_ARGS: "[\"--loop\",\"--json\"]",
      }),
    ).toEqual({ command: "runner", args: ["--loop", "--json"] });
  });
});

describe("JunoLiveWorkerProcessManager", () => {
  it("starts, tracks output, and stops the worker child process", async () => {
    const child = new FakeChildProcess();
    const spawnFn = vi.fn(() => child.asChildProcess());
    const manager = new JunoLiveWorkerProcessManager({
      cwd: "/app",
      env: { JUNO_LIVE_WORKER_COMMAND: "runner", JUNO_LIVE_WORKER_ARGS: "--loop" },
      spawnFn: spawnFn as never,
      now: fixedDates(["2026-06-17T00:00:00.000Z", "2026-06-17T00:00:01.000Z"]),
      logLimit: 2,
    });

    const started = manager.start();
    child.stdout.emit("data", Buffer.from("first\nsecond\nthird\n"));
    child.stderr.emit("data", Buffer.from("warning\n"));

    expect(started).toMatchObject({ state: "running", pid: 1234, command: "runner", args: ["--loop"] });
    expect(spawnFn).toHaveBeenCalledWith(
      "runner",
      ["--loop"],
      expect.objectContaining({
        cwd: "/app",
        env: expect.objectContaining({ JUNO_LIVE_WORKER_MANAGED: "true" }),
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
      env: { JUNO_LIVE_WORKER_COMMAND: "runner" },
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
