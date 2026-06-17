import { describe, expect, it } from "vitest";
import { loadRuntimeEnv, parseScopes } from "./env";

const requiredEnv = {
  GOOGLE_WORKSPACE_DELEGATED_USER: "state303@dsub.io",
  GOOGLE_SERVICE_ACCOUNT_KEY_JSON: "/tmp/key.json",
};

describe("loadRuntimeEnv", () => {
  it("loads required values and applies defaults", () => {
    const env = loadRuntimeEnv(requiredEnv);

    expect(env).toMatchObject({
      GOOGLE_WORKSPACE_DELEGATED_USER: "state303@dsub.io",
      GOOGLE_SERVICE_ACCOUNT_KEY_JSON: "/tmp/key.json",
      GOOGLE_GMAIL_SCOPES: "https://www.googleapis.com/auth/gmail.modify",
      GMAIL_INGEST_QUERY: "to:inventory@dsub.io has:attachment filename:xlsx newer_than:30d",
      GMAIL_MAX_RESULTS: 25,
      GMAIL_INGEST_LOOKBACK_MS: 604800000,
      GMAIL_PROCESSED_LABEL: "Wholesale Processed",
      GMAIL_STORAGE_DIR: ".data/mail-attachments",
      CATALOG_ATTACHMENT_PATTERN: "New Preorders|New Releases In Stock",
      SUPPLIER_CODE: "juno",
      JUNO_LIVE_ENQUEUE_ON_INGEST: false,
      JUNO_BROWSER_PROFILE_DIR: ".data/juno-browser-profile",
      JUNO_BROWSER_HEADLESS: true,
      JUNO_LIVE_CONCURRENCY: 6,
      JUNO_LIVE_DELAY_MIN_MS: 15000,
      JUNO_LIVE_DELAY_MAX_MS: 75000,
      JUNO_LIVE_NAV_TIMEOUT_MS: 45000,
      JUNO_LIVE_MAX_ATTEMPTS: 2,
      JUNO_LIVE_AUTO_ENQUEUE_ON_INTERVAL: true,
      JUNO_LIVE_AUTO_ENQUEUE_LIMIT: 1000,
    });
    expect(env.JUNO_LOGIN_EMAIL).toBeUndefined();
    expect(env.JUNO_LOGIN_PASSWORD).toBeUndefined();
    expect(env.JUNO_LIVE_POLL_INTERVAL_MS).toBeUndefined();
  });

  it("coerces numeric env values and accepts optional database URL", () => {
    const env = loadRuntimeEnv({
      ...requiredEnv,
      DATABASE_URL: "postgres://user:pass@localhost:5432/juno_wholesale_ops",
      GMAIL_MAX_RESULTS: "5",
      GMAIL_INGEST_LOOKBACK_MS: "86400000",
      SUPPLIER_CODE: "juno-wholesale",
      JUNO_LIVE_ENQUEUE_ON_INGEST: "true",
      JUNO_LOGIN_EMAIL: "inventory@dsub.io",
      JUNO_LOGIN_PASSWORD: "secret",
      JUNO_BROWSER_HEADLESS: "false",
      JUNO_LIVE_CONCURRENCY: "4",
      JUNO_LIVE_POLL_INTERVAL_MS: "300000",
      JUNO_LIVE_AUTO_ENQUEUE_ON_INTERVAL: "false",
      JUNO_LIVE_AUTO_ENQUEUE_LIMIT: "50",
      JUNO_LIVE_WORKER_COMMAND: "tsx",
      JUNO_LIVE_WORKER_ARGS: "--loop",
    });

    expect(env.DATABASE_URL).toBe("postgres://user:pass@localhost:5432/juno_wholesale_ops");
    expect(env.GMAIL_MAX_RESULTS).toBe(5);
    expect(env.GMAIL_INGEST_LOOKBACK_MS).toBe(86400000);
    expect(env.SUPPLIER_CODE).toBe("juno-wholesale");
    expect(env.JUNO_LIVE_ENQUEUE_ON_INGEST).toBe(true);
    expect(env.JUNO_LOGIN_EMAIL).toBe("inventory@dsub.io");
    expect(env.JUNO_LOGIN_PASSWORD).toBe("secret");
    expect(env.JUNO_BROWSER_HEADLESS).toBe(false);
    expect(env.JUNO_LIVE_CONCURRENCY).toBe(4);
    expect(env.JUNO_LIVE_POLL_INTERVAL_MS).toBe(300000);
    expect(env.JUNO_LIVE_AUTO_ENQUEUE_ON_INTERVAL).toBe(false);
    expect(env.JUNO_LIVE_AUTO_ENQUEUE_LIMIT).toBe(50);
    expect(env.JUNO_LIVE_WORKER_COMMAND).toBe("tsx");
    expect(env.JUNO_LIVE_WORKER_ARGS).toBe("--loop");
  });

  it("treats blank Juno credentials as unset optional values", () => {
    const env = loadRuntimeEnv({
      ...requiredEnv,
      JUNO_LOGIN_EMAIL: "",
      JUNO_LOGIN_PASSWORD: "",
    });

    expect(env.JUNO_LOGIN_EMAIL).toBeUndefined();
    expect(env.JUNO_LOGIN_PASSWORD).toBeUndefined();
  });

  it("accepts non-string boolean values from programmatic overrides", () => {
    const env = loadRuntimeEnv({
      ...requiredEnv,
      JUNO_BROWSER_HEADLESS: true as unknown as string,
    });

    expect(env.JUNO_BROWSER_HEADLESS).toBe(true);
  });

  it("rejects invalid boolean strings", () => {
    expect(() =>
      loadRuntimeEnv({
        ...requiredEnv,
        JUNO_BROWSER_HEADLESS: "yes",
      }),
    ).toThrow();
  });

  it("rejects invalid delegated users", () => {
    expect(() =>
      loadRuntimeEnv({
        ...requiredEnv,
        GOOGLE_WORKSPACE_DELEGATED_USER: "not-an-email",
      }),
    ).toThrow();
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
});
