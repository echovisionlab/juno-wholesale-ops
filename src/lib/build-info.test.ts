import { describe, expect, it } from "vitest";
import { getPublicVersionInfo } from "./build-info";

describe("getPublicVersionInfo", () => {
  it("exposes only minimal public version metadata", () => {
    const info = getPublicVersionInfo(process.cwd());

    expect(info.status).toBe("ok");
    expect(info.version).toBe("0.6.0");
    expect(Object.keys(info).sort()).toEqual(["gitSha", "status", "version"]);
    expect(info).not.toHaveProperty("buildTime");
    expect(info).not.toHaveProperty("environment");
  });

  it("does not read ad-hoc env aliases for public metadata", () => {
    const originalEnv = { ...process.env };
    Object.assign(process.env, {
      NODE_ENV: "test",
      DATABASE_URL: "postgres://secret@example.test/app",
      AUTH_SECRET: "not-public",
      JUNO_WHOLESALE_OPS_GIT_SHA: "16737e49d2b8531a1a7236290ccb3e8bbb13f6fa",
      GIT_SHA: "16737e49d2b8531a1a7236290ccb3e8bbb13f6fa",
      COMMIT_SHA: "16737e49d2b8531a1a7236290ccb3e8bbb13f6fa",
      SOURCE_COMMIT: "16737e49d2b8531a1a7236290ccb3e8bbb13f6fa",
      VERCEL_GIT_COMMIT_SHA: "16737e49d2b8531a1a7236290ccb3e8bbb13f6fa",
      JUNO_WHOLESALE_OPS_BUILD_TIME: "2026-06-20T19:00:00.000Z",
      BUILD_TIME: "2026-06-20T19:00:00.000Z",
      SOURCE_BUILD_TIME: "2026-06-20T19:00:00.000Z",
      JUNO_WHOLESALE_OPS_ENV: "production",
      APP_ENV: "production",
      VERCEL_ENV: "production",
    });

    try {
      const info = getPublicVersionInfo("/missing-worktree");

      expect(info).toEqual({ status: "ok", version: "0.6.0", gitSha: null });
      expect(JSON.stringify(info)).not.toContain("postgres://");
      expect(JSON.stringify(info)).not.toContain("not-public");
      expect(JSON.stringify(info)).not.toContain("2026-06-20");
      expect(JSON.stringify(info)).not.toContain("production");
    } finally {
      process.env = originalEnv;
    }
  });
});
