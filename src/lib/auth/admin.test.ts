import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireAdmin } from "./admin";
import { getRuntimeBetterAuth } from "./runtime";

vi.mock("./runtime", () => ({
  getRuntimeBetterAuth: vi.fn(),
}));

const getRuntimeBetterAuthMock = vi.mocked(getRuntimeBetterAuth);

describe("requireAdmin", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns auth_unavailable when auth cannot run", async () => {
    getRuntimeBetterAuthMock.mockResolvedValue({
      runtime: runtime({ missing: ["DATABASE_URL"] }),
      auth: null,
      unavailable: true,
    });

    const result = await requireAdmin(new Request("http://app.test/api/settings/status"));

    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.response.status).toBe(503);
      await expect(result.response.json()).resolves.toEqual({
        error: "auth_unavailable",
        missing: ["DATABASE_URL"],
      });
    }
  });

  it("requires an authenticated session", async () => {
    getRuntimeBetterAuthMock.mockResolvedValue({
      runtime: runtime({}),
      auth: authWithSession(null),
      unavailable: false,
    });

    const result = await requireAdmin(new Request("http://app.test/api/settings/status"));

    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.response.status).toBe(401);
      await expect(result.response.json()).resolves.toEqual({
        error: "authentication_required",
      });
    }
  });

  it("rejects non-admin users", async () => {
    getRuntimeBetterAuthMock.mockResolvedValue({
      runtime: runtime({}),
      auth: authWithSession({ user: { id: "user-1", role: "user" } }),
      unavailable: false,
    });

    const result = await requireAdmin(new Request("http://app.test/api/settings/status"));

    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.response.status).toBe(403);
      await expect(result.response.json()).resolves.toEqual({
        error: "admin_required",
      });
    }
  });

  it("returns the admin user for an authorized request", async () => {
    const getSession = vi.fn(async () => ({
      user: {
        id: "admin-1",
        email: "admin@example.com",
        name: "Admin",
        image: null,
        role: "admin",
      },
    }));
    getRuntimeBetterAuthMock.mockResolvedValue({
      runtime: runtime({}),
      auth: {
        handler: vi.fn(),
        api: {
          getSession,
          signUpEmail: vi.fn(),
        },
      },
      unavailable: false,
    });
    const request = new Request("http://app.test/api/settings/status", {
      headers: { cookie: "better-auth.session_token=token" },
    });

    await expect(requireAdmin(request)).resolves.toEqual({
      authorized: true,
      user: {
        id: "admin-1",
        email: "admin@example.com",
        name: "Admin",
        image: null,
        role: "admin",
      },
    });
    expect(getSession).toHaveBeenCalledWith({ headers: request.headers });
  });

  it("treats a missing auth instance as unavailable", async () => {
    getRuntimeBetterAuthMock.mockResolvedValue({
      runtime: runtime({ missing: [] }),
      auth: null,
      unavailable: false,
    });

    const result = await requireAdmin(new Request("http://app.test/api/settings/status"));

    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.response.status).toBe(503);
      await expect(result.response.json()).resolves.toEqual({
        error: "auth_unavailable",
        missing: [],
      });
    }
  });
});

function runtime(options: { missing?: string[] }) {
  return {
    databaseUrl: "postgres://user:pass@localhost:5432/app",
    settings: {
      secret: undefined,
      baseUrl: undefined,
      trustedOrigins: [],
      emailPasswordLoginEnabled: true,
      externalProviders: [],
      initialAdmin: null,
    },
    missing: options.missing ?? [],
  };
}

function authWithSession(session: unknown) {
  return {
    handler: vi.fn(),
    api: {
      getSession: vi.fn(async () => session),
      signUpEmail: vi.fn(),
    },
  };
}
