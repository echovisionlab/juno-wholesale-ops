import { describe, expect, it } from "vitest";
import { getPublicBuildInfo } from "./build-info";

describe("getPublicBuildInfo", () => {
  it("exposes only safe build metadata", () => {
    const gitSha = "16737e49d2b8531a1a7236290ccb3e8bbb13f6fa";
    const info = getPublicBuildInfo({
      NODE_ENV: "test",
      DATABASE_URL: "postgres://secret@example.test/app",
      AUTH_SECRET: "not-public",
      JUNO_WHOLESALE_OPS_GIT_SHA: gitSha,
      JUNO_WHOLESALE_OPS_BUILD_TIME: "2026-06-20T19:00:00.000Z",
    } as NodeJS.ProcessEnv, "/missing-worktree");

    expect(info).toEqual({
      status: "ok",
      version: "0.6.0",
      gitSha,
      buildTime: "2026-06-20T19:00:00.000Z",
      environment: "test",
    });
    expect(JSON.stringify(info)).not.toContain("postgres://");
    expect(JSON.stringify(info)).not.toContain("not-public");
  });
});
