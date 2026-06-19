import { describe, expect, it } from "vitest";
import {
  GOOGLE_GMAIL_MODIFY_SCOPE,
  GOOGLE_GMAIL_READONLY_SCOPE,
  getDatabaseUrl,
  hasGmailModifyScope,
  loadRuntimeEnv,
  parseScopes,
} from "./env";

const configuredEnv = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/juno_wholesale_ops",
};

describe("loadRuntimeEnv", () => {
  it("loads only the required app runtime values", () => {
    const env = loadRuntimeEnv({
      ...configuredEnv,
      AUTH_INITIAL_ADMIN_EMAIL: "admin@example.com",
      AUTH_INITIAL_ADMIN_PASSWORD: "password123",
    });

    expect(env).toEqual({
      DATABASE_URL: configuredEnv.DATABASE_URL,
      AUTH_INITIAL_ADMIN_EMAIL: "admin@example.com",
      AUTH_INITIAL_ADMIN_PASSWORD: "password123",
    });
  });

  it("ignores removed app env values", () => {
    const env = loadRuntimeEnv({
      ...configuredEnv,
      AUTH_SECRET: "a".repeat(32),
      AUTH_BASE_URL: "https://app.example.com",
      AUTH_ENABLED: "false",
      JUNO_WHOLESALE_OPS_DATA_MODE: "demo",
      JUNO_LOGIN_PASSWORD: "secret",
    });

    expect(Object.keys(env).sort()).toEqual([
      "AUTH_INITIAL_ADMIN_EMAIL",
      "AUTH_INITIAL_ADMIN_PASSWORD",
      "DATABASE_URL",
    ]);
    expect("AUTH_SECRET" in env).toBe(false);
    expect("AUTH_BASE_URL" in env).toBe(false);
    expect("AUTH_ENABLED" in env).toBe(false);
    expect("JUNO_WHOLESALE_OPS_DATA_MODE" in env).toBe(false);
  });

  it("requires DATABASE_URL", () => {
    expect(() => loadRuntimeEnv({})).toThrow();
  });

  it("validates optional initial admin values when present", () => {
    expect(() =>
      loadRuntimeEnv({
        ...configuredEnv,
        AUTH_INITIAL_ADMIN_EMAIL: "not-an-email",
        AUTH_INITIAL_ADMIN_PASSWORD: "short",
      }),
    ).toThrow();
  });

  it("returns DATABASE_URL through getDatabaseUrl", () => {
    expect(getDatabaseUrl(configuredEnv)).toBe(configuredEnv.DATABASE_URL);
  });
});

describe("parseScopes", () => {
  it("splits comma and whitespace separated scopes", () => {
    expect(parseScopes(" scope-a,scope-b  scope-c\n\n")).toEqual([
      "scope-a",
      "scope-b",
      "scope-c",
    ]);
  });

  it("detects Gmail modify scope for label mode", () => {
    expect(hasGmailModifyScope(GOOGLE_GMAIL_READONLY_SCOPE)).toBe(false);
    expect(hasGmailModifyScope(`${GOOGLE_GMAIL_READONLY_SCOPE} ${GOOGLE_GMAIL_MODIFY_SCOPE}`)).toBe(true);
  });
});
