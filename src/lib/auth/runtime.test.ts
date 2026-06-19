import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRuntimeBetterAuth } from "./runtime";
import { getCachedAppAuth } from "./app-auth";
import { listSsoProviders } from "./sso-provider-repository";
import { withJunoLiveRepository } from "@/lib/juno-live/repository";
import { ensureDatabaseAuthSecretClient } from "@/lib/settings/repository";

vi.mock("./app-auth", () => ({
  getCachedAppAuth: vi.fn(),
}));

vi.mock("./sso-provider-repository", () => ({
  listSsoProviders: vi.fn(),
}));

vi.mock("@/lib/juno-live/repository", () => ({
  withJunoLiveRepository: vi.fn(),
}));

vi.mock("@/lib/settings/repository", () => ({
  ensureDatabaseAuthSecretClient: vi.fn(),
}));

const getCachedAppAuthMock = vi.mocked(getCachedAppAuth);
const listSsoProvidersMock = vi.mocked(listSsoProviders);
const withJunoLiveRepositoryMock = vi.mocked(withJunoLiveRepository);
const ensureDatabaseAuthSecretClientMock = vi.mocked(ensureDatabaseAuthSecretClient);

describe("getRuntimeBetterAuth", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/app");
    listSsoProvidersMock.mockResolvedValue([]);
    getCachedAppAuthMock.mockResolvedValue(authInstance());
  });

  it("uses the current request origin while the DB site address is not saved yet", async () => {
    mockSettingsRow({ auth_secret: "a".repeat(32), auth_base_url: null });

    const result = await getRuntimeBetterAuth({ requestOrigin: "https://inventory-dev.example.test/settings" });

    expect(result.unavailable).toBe(false);
    expect(result.runtime.missing).toEqual([]);
    expect(result.runtime.settings.baseUrl).toBe("https://inventory-dev.example.test");
    expect(getCachedAppAuthMock).toHaveBeenCalledWith(expect.objectContaining({
      settings: expect.objectContaining({ baseUrl: "https://inventory-dev.example.test" }),
    }));
  });

  it("keeps the saved DB site address ahead of the current request origin", async () => {
    mockSettingsRow({ auth_secret: "a".repeat(32), auth_base_url: "https://saved.example.test" });

    await getRuntimeBetterAuth({ requestOrigin: "https://inventory-dev.example.test/settings" });

    expect(getCachedAppAuthMock).toHaveBeenCalledWith(expect.objectContaining({
      settings: expect.objectContaining({ baseUrl: "https://saved.example.test" }),
    }));
  });

  it("generates a DB auth secret before checking runtime readiness", async () => {
    ensureDatabaseAuthSecretClientMock.mockResolvedValue("b".repeat(32));
    mockSettingsRow({ auth_secret: null, auth_base_url: null });

    const result = await getRuntimeBetterAuth({ requestOrigin: "https://inventory-dev.example.test/settings" });

    expect(result.unavailable).toBe(false);
    expect(result.runtime.settings.secret).toBe("b".repeat(32));
    expect(ensureDatabaseAuthSecretClientMock).toHaveBeenCalledOnce();
  });

  it("stays unavailable when neither DB site address nor request origin is usable", async () => {
    mockSettingsRow({ auth_secret: "a".repeat(32), auth_base_url: null });

    const result = await getRuntimeBetterAuth({ requestOrigin: "not-a-url" });

    expect(result.unavailable).toBe(true);
    expect(result.runtime.missing).toEqual(["auth_base_url"]);
    expect(getCachedAppAuthMock).not.toHaveBeenCalled();
  });
});

function mockSettingsRow(overrides: { auth_secret: string | null; auth_base_url: string | null }) {
  withJunoLiveRepositoryMock.mockImplementation(async (_databaseUrl, callback) =>
    callback({
      getServiceSettingsRow: vi.fn(async () => ({
        auth_secret: overrides.auth_secret,
        auth_base_url: overrides.auth_base_url,
        auth_trusted_origins: null,
        auth_email_password_login_enabled: true,
      })),
    } as never, {} as never),
  );
}

function authInstance() {
  return {
    handler: vi.fn(),
    api: {
      getSession: vi.fn(),
      signUpEmail: vi.fn(),
    },
  };
}
