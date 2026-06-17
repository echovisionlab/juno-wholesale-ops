import { describe, expect, it } from "vitest";
import {
  GOOGLE_GMAIL_MODIFY_SCOPE,
  GOOGLE_GMAIL_READONLY_SCOPE,
  hasGmailModifyScope,
  loadRuntimeEnv,
  parseScopes,
} from "./env";

const configuredEnv = {
  GOOGLE_WORKSPACE_DELEGATED_USER: "operator@example.com",
  GOOGLE_SERVICE_ACCOUNT_KEY_JSON: "/tmp/key.json",
};

describe("loadRuntimeEnv", () => {
  it("loads required values and applies defaults", () => {
    const env = loadRuntimeEnv({});

    expect(env).toMatchObject({
      GOOGLE_GMAIL_SCOPES: GOOGLE_GMAIL_READONLY_SCOPE,
      GMAIL_INGEST_QUERY: "has:attachment filename:xlsx newer_than:30d",
      GMAIL_MAX_RESULTS: 25,
      GMAIL_INGEST_LOOKBACK_MS: 604800000,
      GMAIL_PROCESSED_LABEL: "Wholesale Processed",
      GMAIL_STORAGE_DIR: ".data/mail-attachments",
      CATALOG_ATTACHMENT_PATTERN: "New Preorders|New Releases In Stock",
      SUPPLIER_CODE: "juno",
      JUNO_LIVE_ENQUEUE_ON_INGEST: false,
      AUTH_ENABLED: false,
      AUTH_EMAIL_PASSWORD_ENABLED: true,
      AUTH_EXTERNAL_PROVIDER_ENABLED: false,
      AUTH_INITIAL_ADMIN_NAME: "Initial Admin",
      JUNO_BROWSER_PROFILE_DIR: ".data/juno-browser-profile",
      JUNO_BROWSER_HEADLESS: true,
      JUNO_LIVE_CONCURRENCY: 1,
      JUNO_LIVE_DELAY_MIN_MS: 30000,
      JUNO_LIVE_DELAY_MAX_MS: 180000,
      JUNO_LIVE_NAV_TIMEOUT_MS: 45000,
      JUNO_LIVE_MAX_ATTEMPTS: 2,
      JUNO_LIVE_AUTO_ENQUEUE_ON_INTERVAL: false,
      JUNO_LIVE_AUTO_ENQUEUE_LIMIT: 1000,
    });
    expect(env.GOOGLE_WORKSPACE_DELEGATED_USER).toBeUndefined();
    expect(env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON).toBeUndefined();
    expect(env.AUTH_SECRET).toBeUndefined();
    expect(env.AUTH_BASE_URL).toBeUndefined();
    expect(env.AUTH_TRUSTED_ORIGINS).toBeUndefined();
    expect(env.AUTH_INITIAL_ADMIN_EMAIL).toBeUndefined();
    expect(env.AUTH_INITIAL_ADMIN_PASSWORD).toBeUndefined();
    expect(env.JUNO_LOGIN_EMAIL).toBeUndefined();
    expect(env.JUNO_LOGIN_PASSWORD).toBeUndefined();
    expect(env.JUNO_LIVE_POLL_INTERVAL_MS).toBeUndefined();
  });

  it("coerces numeric env values and accepts optional database URL", () => {
    const env = loadRuntimeEnv({
      ...configuredEnv,
      DATABASE_URL: "postgres://user:pass@localhost:5432/juno_wholesale_ops",
      AUTH_ENABLED: "true",
      AUTH_SECRET: "a".repeat(32),
      AUTH_BASE_URL: "https://app.example.com",
      AUTH_TRUSTED_ORIGINS: "https://app.example.com,https://admin.example.com",
      AUTH_EMAIL_PASSWORD_ENABLED: "false",
      AUTH_EXTERNAL_PROVIDER_ENABLED: "true",
      AUTH_EXTERNAL_PROVIDER_ID: "workspace",
      AUTH_EXTERNAL_PROVIDER_NAME: "Workspace",
      AUTH_EXTERNAL_DISCOVERY_URL: "https://login.example.com/.well-known/openid-configuration",
      AUTH_EXTERNAL_CLIENT_ID: "client-id",
      AUTH_EXTERNAL_CLIENT_SECRET: "client-secret",
      AUTH_INITIAL_ADMIN_EMAIL: "admin@example.com",
      AUTH_INITIAL_ADMIN_PASSWORD: "password123",
      AUTH_INITIAL_ADMIN_NAME: "Ops Admin",
      GMAIL_MAX_RESULTS: "5",
      GMAIL_INGEST_LOOKBACK_MS: "86400000",
      SUPPLIER_CODE: "juno-wholesale",
      JUNO_LIVE_ENQUEUE_ON_INGEST: "true",
      JUNO_LOGIN_EMAIL: "catalog@example.com",
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
    expect(env.AUTH_ENABLED).toBe(true);
    expect(env.AUTH_SECRET).toBe("a".repeat(32));
    expect(env.AUTH_BASE_URL).toBe("https://app.example.com");
    expect(env.AUTH_TRUSTED_ORIGINS).toBe("https://app.example.com,https://admin.example.com");
    expect(env.AUTH_EMAIL_PASSWORD_ENABLED).toBe(false);
    expect(env.AUTH_EXTERNAL_PROVIDER_ENABLED).toBe(true);
    expect(env.AUTH_EXTERNAL_PROVIDER_ID).toBe("workspace");
    expect(env.AUTH_EXTERNAL_PROVIDER_NAME).toBe("Workspace");
    expect(env.AUTH_EXTERNAL_DISCOVERY_URL).toBe("https://login.example.com/.well-known/openid-configuration");
    expect(env.AUTH_EXTERNAL_CLIENT_ID).toBe("client-id");
    expect(env.AUTH_EXTERNAL_CLIENT_SECRET).toBe("client-secret");
    expect(env.AUTH_INITIAL_ADMIN_EMAIL).toBe("admin@example.com");
    expect(env.AUTH_INITIAL_ADMIN_PASSWORD).toBe("password123");
    expect(env.AUTH_INITIAL_ADMIN_NAME).toBe("Ops Admin");
    expect(env.GMAIL_MAX_RESULTS).toBe(5);
    expect(env.GMAIL_INGEST_LOOKBACK_MS).toBe(86400000);
    expect(env.SUPPLIER_CODE).toBe("juno-wholesale");
    expect(env.JUNO_LIVE_ENQUEUE_ON_INGEST).toBe(true);
    expect(env.JUNO_LOGIN_EMAIL).toBe("catalog@example.com");
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
      ...configuredEnv,
      JUNO_LOGIN_EMAIL: "",
      JUNO_LOGIN_PASSWORD: "",
    });

    expect(env.JUNO_LOGIN_EMAIL).toBeUndefined();
    expect(env.JUNO_LOGIN_PASSWORD).toBeUndefined();
  });

  it("accepts non-string boolean values from programmatic overrides", () => {
    const env = loadRuntimeEnv({
      ...configuredEnv,
      JUNO_BROWSER_HEADLESS: true as unknown as string,
    });

    expect(env.JUNO_BROWSER_HEADLESS).toBe(true);
  });

  it("rejects invalid boolean strings", () => {
    expect(() =>
      loadRuntimeEnv({
        ...configuredEnv,
        JUNO_BROWSER_HEADLESS: "yes",
      }),
    ).toThrow();
  });

  it("rejects invalid delegated users", () => {
    expect(() =>
      loadRuntimeEnv({
        ...configuredEnv,
        GOOGLE_WORKSPACE_DELEGATED_USER: "not-an-email",
      }),
    ).toThrow();
  });

  it("rejects short auth secrets and invalid external discovery URLs", () => {
    expect(() =>
      loadRuntimeEnv({
        ...configuredEnv,
        AUTH_SECRET: "too-short",
      }),
    ).toThrow();

    expect(() =>
      loadRuntimeEnv({
        ...configuredEnv,
        AUTH_EXTERNAL_DISCOVERY_URL: "not-a-url",
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

  it("detects Gmail modify scope for label mode", () => {
    expect(hasGmailModifyScope(GOOGLE_GMAIL_READONLY_SCOPE)).toBe(false);
    expect(hasGmailModifyScope(`${GOOGLE_GMAIL_READONLY_SCOPE} ${GOOGLE_GMAIL_MODIFY_SCOPE}`)).toBe(true);
  });
});
