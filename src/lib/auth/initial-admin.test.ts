import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import {
  closeSeedAuthDatabase,
  seedInitialAdmin,
  seedInitialAdminWithPool,
} from "./initial-admin";
import type { AppAuthSettings } from "./settings";

const signUpEmailMock = vi.hoisted(() => vi.fn());

vi.mock("better-auth", () => ({
  betterAuth: () => ({
    api: {
      signUpEmail: signUpEmailMock,
    },
  }),
}));

beforeEach(() => {
  signUpEmailMock.mockReset();
  signUpEmailMock.mockResolvedValue({});
});

describe("closeSeedAuthDatabase", () => {
  it("closes owned pools after destroying the Kysely instance", async () => {
    const db = { destroy: vi.fn().mockResolvedValue(undefined) };
    const pool = { end: vi.fn().mockResolvedValue(undefined) };

    await closeSeedAuthDatabase({ db, pool, ownsPool: true });

    expect(db.destroy).toHaveBeenCalledOnce();
    expect(pool.end).toHaveBeenCalledOnce();
  });

  it("keeps borrowed pools open", async () => {
    const db = { destroy: vi.fn().mockResolvedValue(undefined) };
    const pool = { end: vi.fn().mockResolvedValue(undefined) };

    await closeSeedAuthDatabase({ db, pool, ownsPool: false });

    expect(db.destroy).toHaveBeenCalledOnce();
    expect(pool.end).not.toHaveBeenCalled();
  });
});

describe("seedInitialAdmin", () => {
  it("skips when initial admin env is absent", async () => {
    await expect(
      seedInitialAdmin({
        databaseUrl: "postgres://user:pass@localhost:5432/app",
        settings: authSettings({ initialAdmin: null }),
      }),
    ).resolves.toEqual({ status: "skipped", reason: "missing_config" });
  });

  it("creates the configured initial admin through Better Auth", async () => {
    const pool = fakePool([{ rows: [] }, { rows: [] }]);

    await expect(
      seedInitialAdmin({
        databaseUrl: "postgres://user:pass@localhost:5432/app",
        settings: authSettings({
          enabled: true,
          secret: "a".repeat(32),
          baseUrl: "https://app.example.com",
          initialAdmin: {
            email: "admin@example.com",
            password: "password123",
            name: "Admin",
          },
        }),
        pool,
      }),
    ).resolves.toEqual({ status: "created", email: "admin@example.com" });
    expect(signUpEmailMock).toHaveBeenCalledWith({
      body: {
        email: "admin@example.com",
        password: "password123",
        name: "Admin",
      },
      headers: expect.any(Headers),
    });
  });
});

describe("seedInitialAdminWithPool", () => {
  it("does not create a user when the email already exists", async () => {
    const createUser = vi.fn();
    const pool = fakePool([{ rows: [{ id: "user-1" }] }]);

    await expect(
      seedInitialAdminWithPool({
        pool,
        initialAdmin: { email: "admin@example.com", password: "password123", name: "Admin" },
        createUser,
      }),
    ).resolves.toEqual({ status: "skipped", reason: "duplicate" });
    expect(createUser).not.toHaveBeenCalled();
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it("creates and promotes a missing initial admin", async () => {
    const createUser = vi.fn().mockResolvedValue(undefined);
    const pool = fakePool([{ rows: [] }, { rows: [] }]);

    await expect(
      seedInitialAdminWithPool({
        pool,
        initialAdmin: { email: "admin@example.com", password: "password123", name: "Admin" },
        createUser,
      }),
    ).resolves.toEqual({ status: "created", email: "admin@example.com" });
    expect(createUser).toHaveBeenCalledOnce();
    expect(pool.query).toHaveBeenLastCalledWith(expect.stringContaining("UPDATE auth_user"), [
      "admin@example.com",
    ]);
  });
});

function authSettings(overrides: Partial<AppAuthSettings>): AppAuthSettings {
  return {
    enabled: false,
    secret: undefined,
    baseUrl: undefined,
    trustedOrigins: [],
    emailPasswordEnabled: true,
    externalProviderEnabled: false,
    externalProvider: null,
    initialAdmin: null,
    ...overrides,
  };
}

function fakePool(results: Array<{ rows: unknown[] }>): Pool & {
  query: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
} {
  const query = vi.fn();
  for (const result of results) {
    query.mockResolvedValueOnce(result);
  }
  return {
    query,
    end: vi.fn().mockResolvedValue(undefined),
  } as unknown as Pool & {
    query: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  };
}
